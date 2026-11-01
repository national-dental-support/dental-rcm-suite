#!/usr/bin/env node
/**
 * SQL Migration Runner
 *
 * Reads .sql files from  /migrations  in filename order and executes any
 * that haven't been recorded in the  __migrations  tracking table.
 *
 * Naming convention:  NNN_description.sql   (e.g. 001_add_indexes.sql)
 *
 * Usage:
 *   node db/migrate.js                        # run all pending migrations
 *   node db/migrate.js --dry-run              # list pending without executing
 *   node db/migrate.js --status               # show migration history
 *   node db/migrate.js --skip seed            # skip files tagged 'seed'
 *   node db/migrate.js --skip seed,optional   # skip multiple tags
 *
 * Environment variables (or .env via dotenv):
 *   DB_SERVER   (default: 127.0.0.1)
 *   DB_PORT     (default: 1433)
 *   DB_USER     (default: sa)
 *   DB_PASSWORD
 *   DB_NAME     (default: dental_rcm)
 *   MIGRATE_DB_USER / MIGRATE_DB_PASSWORD (optional): dedicated migration login.
 *     Migrations need DDL rights; when the app runs as a restricted non-db_owner
 *     login (the RLS-enforced application login), set these so migrations connect as a
 *     privileged login instead. Falls back to DB_USER/MSSQL_USERNAME when unset.
 */

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

// -- Config -----------------------------------------------------------
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) { /* dotenv optional */ }

const MIGRATIONS_DIR      = path.join(__dirname, 'migrations');
const DRY_RUN = process.argv.includes('--dry-run');
const STATUS  = process.argv.includes('--status');
const SKIP_TAGS = (() => {
  const idx = process.argv.indexOf('--skip');
  return idx >= 0 && process.argv[idx + 1]
    ? process.argv[idx + 1].split(',').map(t => t.trim().toLowerCase())
    : [];
})();

const config = {
  // IPv4 literal, not "localhost": on Windows that resolves to ::1 first and
  // fails against an IPv4-only SQL Server listener.
  server:   process.env.DB_SERVER   || process.env.MSSQL_SERVER   || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || process.env.MSSQL_PORT || '1433', 10),
  user:     process.env.MIGRATE_DB_USER     || process.env.DB_USER     || process.env.MSSQL_USERNAME || 'sa',
  password: process.env.MIGRATE_DB_PASSWORD || process.env.DB_PASSWORD || process.env.MSSQL_PASSWORD || '',
  database: process.env.DB_NAME     || process.env.MSSQL_DB_NAME  || 'dental_rcm',
  // enableQuotedIdentifier ON at login: filtered indexes / indexed views require it at CREATE
  // time, and a SET inside the same batch is a no-op (parse-time setting for the whole batch).
  options:  { trustServerCertificate: true, encrypt: true, enableQuotedIdentifier: true },
  requestTimeout: 120000,
  connectionTimeout: 60000,
  pool: { max: 2, min: 0, idleTimeoutMillis: 15000 },
};

// -- Helpers ----------------------------------------------------------
function log(msg)  { console.log(`[migrate] ${msg}`); }
function warn(msg) { console.log(`[migrate] WARN  ${msg}`); }
function ok(msg)   { console.log(`[migrate] OK  ${msg}`); }
function fail(msg) { console.error(`[migrate] FAIL  ${msg}`); }

/**
 * Ensure the tracking table exists.
 */
async function ensureTable(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.__migrations', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.__migrations (
        id         INT IDENTITY(1,1) PRIMARY KEY,
        filename   NVARCHAR(500)  NOT NULL UNIQUE,
        checksum   NVARCHAR(64)   NOT NULL,
        applied_at DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        duration_ms INT           NULL
      );
    END
  `);
}

/**
 * Return Set of filenames already applied.
 */
async function getApplied(pool) {
  const result = await pool.request().query(
    'SELECT filename FROM dbo.__migrations ORDER BY id'
  );
  return new Set(result.recordset.map(r => r.filename));
}

/**
 * Extract @tags from the first line of a migration file.
 * Format: -- @tags: core,optional,seed
 */
function extractTags(fullPath) {
  const first = fs.readFileSync(fullPath, 'utf8').split('\n')[0];
  const match = first.match(/--\s*@tags:\s*(.+)/i);
  return match ? match[1].split(',').map(t => t.trim().toLowerCase()) : [];
}

// C3 seed governance: every migration is classified `-- @data: reference|demo|pii`
// (near the top of the file). DATA_PROFILE selects what enters the DB:
//   clean -> reference only (a certifiable new install: no demo, no PII)
//   demo  -> reference + demo (local/sandbox)
// PII (real identities) is emitted ONLY when SEED_VENDOR_ADMINS=true, regardless of profile.
// This distribution ships no demo or PII migrations, so the default is `clean`:
// a profile that admits demo data by default would silently load any that were
// added later.
const DATA_PROFILE = (process.env.DATA_PROFILE || 'clean').toLowerCase();
const SEED_VENDOR_ADMINS = process.env.SEED_VENDOR_ADMINS === 'true';
function extractDataClass(fullPath) {
  const head = fs.readFileSync(fullPath, 'utf8').slice(0, 600);
  const m = head.match(/--\s*@data:\s*(reference|demo|pii)\b/i);
  return m ? m[1].toLowerCase() : null;
}
function dataClassAllowed(cls) {
  const c = cls || 'reference'; // unclassified -> reference (CI enforces classification)
  if (c === 'pii')  return SEED_VENDOR_ADMINS;
  if (c === 'demo') return DATA_PROFILE !== 'clean';
  return true; // reference: always
}

/**
 * Discover .sql files from migrations/ and migrations/demo/ (if present),
 * sorted by filename. Returns { name, fullPath } objects.
 * __migrations tracks by name (filename only) - backward-compatible with
 * existing DBs that recorded filenames before the demo/ subdirectory existed.
 */
function discoverFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    warn(`No migrations directory at ${MIGRATIONS_DIR}`);
    return [];
  }

  const collect = (dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .map(f => ({ name: f, fullPath: path.join(dir, f) }));
  };

  // Filename order is the apply order, and it is also how applied migrations
  // are tracked, so this sort is the schema's version sequence.
  let all = collect(MIGRATIONS_DIR)
    .sort((a, b) => a.name.localeCompare(b.name));

  // C3: filter by @data class against the active DATA_PROFILE first.
  log(`Data profile: ${DATA_PROFILE} (seedVendorAdmins=${SEED_VENDOR_ADMINS})`);
  all = all.filter(({ name, fullPath }) => {
    const cls = extractDataClass(fullPath);
    if (!cls) warn(`Unclassified migration (no @data directive): ${name} - treating as reference`);
    const allowed = dataClassAllowed(cls);
    if (!allowed) log(`Excluding ${name} (@data: ${cls || 'none'})`);
    return allowed;
  });

  if (SKIP_TAGS.length === 0) return all;

  return all.filter(({ name, fullPath }) => {
    const tags = extractTags(fullPath);
    // Also treat any file whose name contains a skip tag as skippable,
    // so "--skip seed" catches files like 003_seed_demo.sql even without @tags
    const nameTags = SKIP_TAGS.filter(t => name.toLowerCase().includes(t));
    const allTags = [...new Set([...tags, ...nameTags])];
    const dominated = allTags.some(t => SKIP_TAGS.includes(t));
    if (dominated) log(`Skipping ${name} (tags: ${allTags.join(',')})`);
    return !dominated;
  });
}

/**
 * Simple checksum (SHA-256 hex).
 */
function checksum(content) {
  return require('crypto').createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// The published bootstrap hash: bcrypt cost 12 of "changeme-on-first-login".
// Used when BOOTSTRAP_ADMIN_PASSWORD is not set. It is public knowledge, which
// is why must_change_password gates every other route until it is replaced.
const DEFAULT_BOOTSTRAP_HASH = '$2a$12$lLStJPmzN3mQJ0IaFiWePu4N6oAaFVnEJq4R5ZK63dXNclBIu97wy';
const MIN_BOOTSTRAP_PASSWORD_LENGTH = 12;

/**
 * Render a value as an nvarchar literal, doubling embedded quotes.
 */
function sqlLiteral(value) {
  return `N'${String(value).replaceAll("'", "''")}'`;
}

/**
 * The bcrypt hash the bootstrap administrator is created with.
 *
 * BOOTSTRAP_ADMIN_PASSWORD is hashed here rather than being stored anywhere, so
 * an operator can avoid ever having the published default in their database.
 * The password itself is never logged.
 */
function bootstrapHash() {
  const supplied = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!supplied) return DEFAULT_BOOTSTRAP_HASH;

  if (supplied.length < MIN_BOOTSTRAP_PASSWORD_LENGTH) {
    throw new Error(
      `BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_BOOTSTRAP_PASSWORD_LENGTH} characters`,
    );
  }

  let bcrypt;
  try {
    bcrypt = require('bcryptjs');
  } catch (_) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD is set but bcryptjs is not installed');
  }
  return bcrypt.hashSync(supplied, 12);
}

/**
 * Tokens a migration may reference as {{NAME}}, resolved from the environment.
 *
 * Each is a function so nothing is computed - and no password is hashed - unless
 * a migration actually asks for it. Values are rendered as nvarchar literals
 * with quotes doubled, never interpolated raw.
 */
const SQL_TOKENS = {
  BOOTSTRAP_ADMIN_EMAIL: () => process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@localhost',
  BOOTSTRAP_ADMIN_HASH:  () => bootstrapHash(),
  APP_DB_USER:           () => process.env.APP_DB_USER || 'dental_rcm_app',
  APP_DB_PASSWORD:       () => process.env.APP_DB_PASSWORD || '',
};

/**
 * Read a migration, substituting any {{TOKEN}} it references.
 *
 * Returns the raw text as well, so __migrations records a checksum of what is
 * in the repository rather than one that varies with the environment.
 */
function loadSql(fullPath) {
  const raw = fs.readFileSync(fullPath, 'utf8').trim();
  if (!raw.includes('{{')) return { raw, text: raw };

  let text = raw;
  for (const [name, resolve] of Object.entries(SQL_TOKENS)) {
    const token = `{{${name}}}`;
    if (text.includes(token)) text = text.replaceAll(token, sqlLiteral(resolve()));
  }

  const unresolved = text.match(/\{\{[A-Z_]+\}\}/);
  if (unresolved) throw new Error(`Unknown substitution token ${unresolved[0]} in ${path.basename(fullPath)}`);

  return { raw, text };
}

/**
 * Run an always-refresh script (no transaction tracking).
 * Failures warn but do not abort server startup.
 */
async function runRefreshMigration(pool, { name, fullPath }) {
  const { text: content } = loadSql(fullPath);
  if (!content) { warn(`Skipping empty file: ${name}`); return; }

  const batches = content
    .split(/^\s*GO\s*$/mi)
    .map(b => b.trim())
    .filter(Boolean);

  try {
    for (const batch of batches) {
      await new sql.Request(pool).query(batch);
    }
    ok(`${name}  (refresh)`);
  } catch (err) {
    warn(`${name} refresh failed \u2014 ${err.message || String(err)}`);
  }
}

/**
 * Run a single migration inside a transaction.
 * Tracks by name (filename only) in __migrations for backward compatibility.
 */
async function runMigration(pool, { name, fullPath }) {
  const { raw, text: content } = loadSql(fullPath);
  if (!content) { warn(`Skipping empty file: ${name}`); return; }

  // Checksum the repository text, not the substituted text, so the recorded
  // value does not change with the environment.
  const hash = checksum(raw);
  const start = Date.now();

  // Split on GO batches (SSMS-style)
  const batches = content
    .split(/^\s*GO\s*$/mi)
    .map(b => b.trim())
    .filter(Boolean);

  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    for (const batch of batches) {
      await new sql.Request(tx).query(batch);
    }
    // Record the migration - store by name only (not full path) for backward compatibility
    const req = new sql.Request(tx);
    req.input('filename', sql.NVarChar(500), name);
    req.input('checksum', sql.NVarChar(64), hash);
    req.input('duration', sql.Int, Date.now() - start);
    await req.query(`
      INSERT INTO dbo.__migrations (filename, checksum, duration_ms)
      VALUES (@filename, @checksum, @duration)
    `);
    await tx.commit();
    ok(`${name}  (${Date.now() - start}ms)`);
  } catch (err) {
    try { await tx.rollback(); } catch (_) {}
    throw err;
  }
}

/**
 * Ensure the target database exists (for fresh Docker instances).
 */
async function ensureDatabase() {
  const masterConfig = { ...config, database: 'master' };
  const masterPool = await new sql.ConnectionPool(masterConfig).connect();
  try {
    const result = await masterPool.request().query(
      `SELECT 1 FROM sys.databases WHERE name = '${config.database}'`
    );
    if (result.recordset.length === 0) {
      log(`Database '${config.database}' does not exist \u2014 creating...`);
      await masterPool.request().query(`CREATE DATABASE [${config.database}]`);
      ok(`Database '${config.database}' created`);
    }
  } finally {
    await masterPool.close();
  }
}

// -- Main -------------------------------------------------------------
async function main() {
  let pool;
  try {
    log(`Connecting to ${config.server}:${config.port}/${config.database} ...`);
    await ensureDatabase();
    pool = await sql.connect(config);
    await ensureTable(pool);

    // --status: show history and exit
    if (STATUS) {
      const result = await pool.request().query(
        'SELECT filename, checksum, applied_at, duration_ms FROM dbo.__migrations ORDER BY id'
      );
      if (result.recordset.length === 0) {
        log('No migrations have been applied yet.');
      } else {
        console.log('\n  #  | Filename                              | Applied At           | Duration');
        console.log('  ---+------------------------------------------+----------------------+---------');
        result.recordset.forEach((r, i) => {
          const dt = new Date(r.applied_at).toISOString().replace('T', ' ').slice(0, 19);
          console.log(`  ${String(i + 1).padStart(2)} | ${r.filename.padEnd(40)} | ${dt} | ${r.duration_ms ?? '?'}ms`);
        });
        console.log('');
      }
      await pool.close();
      return;
    }

    const applied = await getApplied(pool);
    const files = discoverFiles();

    // Split: always-refresh (re-run every startup) vs one-time tracked migrations
    const alwaysFiles  = files.filter(f => extractTags(f.fullPath).includes('always'));
    const oneTimeFiles = files.filter(f => !extractTags(f.fullPath).includes('always'));
    const pending = oneTimeFiles.filter(f => !applied.has(f.name));

    if (pending.length === 0 && alwaysFiles.length === 0) {
      ok('No pending migrations.');
      await pool.close();
      return;
    }

    if (pending.length > 0) {
      log(`Found ${pending.length} pending migration(s):`);
      pending.forEach((f, i) => console.log(`  ${i + 1}. ${f.name}`));
      console.log('');
    }
    if (alwaysFiles.length > 0) {
      log(`Found ${alwaysFiles.length} always-refresh script(s):`);
      alwaysFiles.forEach((f, i) => console.log(`  ${i + 1}. ${f.name}`));
      console.log('');
    }

    if (DRY_RUN) {
      log('Dry run \u2014 no changes applied.');
      await pool.close();
      return;
    }

    for (const file of pending) {
      log(`Applying: ${file.name} ...`);
      await runMigration(pool, file);
    }

    if (pending.length > 0) {
      ok(`${pending.length} migration(s) applied successfully.`);
    }

    // Run always-refresh scripts after one-time migrations
    if (alwaysFiles.length > 0) {
      log(`Running ${alwaysFiles.length} always-refresh script(s)...`);
      for (const file of alwaysFiles) {
        log(`Refreshing: ${file.name} ...`);
        await runRefreshMigration(pool, file);
      }
      ok(`${alwaysFiles.length} always-refresh script(s) complete.`);
    }

    await pool.close();
  } catch (err) {
    fail(err.message || String(err));
    if (pool) try { await pool.close(); } catch (_) {}
    process.exit(1);
  }
}

main();
