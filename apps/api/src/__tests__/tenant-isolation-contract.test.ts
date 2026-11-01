import * as fs from 'fs';
import * as path from 'path';

/**
 * Tenant isolation is enforced twice: once in the application, once by a SQL
 * Server security policy. The two halves are wired together by convention
 * rather than by the type system, and both halves have already failed once:
 *
 *   - rls-context.ts granted see_all whenever customer_id was null, which turned
 *     every request without a resolved tenant into a cross-tenant read. The
 *     comment above it claimed the opposite - that it failed closed.
 *   - The documentation described a security policy that no migration created,
 *     so the second layer was prose.
 *
 * These tests are structural on purpose. A mocked test cannot certify SQL
 * behaviour, so they do not pretend to: they assert the contract between the
 * two halves, which is exactly what drifts. The behavioural check needs a real
 * database and lives in tenant-isolation-live.test.ts.
 */

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const rlsContextPath = path.join(__dirname, '..', 'modules', 'rls-context.ts');
const policyPath = path.join(repoRoot, 'db', 'migrations', '902_tenant_rls_policy.sql');
const appLoginPath = path.join(repoRoot, 'db', 'migrations', '903_app_login.sql');

function read(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

describe('tenant isolation: application and database halves agree', () => {
  it('ships a migration that creates the security policy', () => {
    expect(fs.existsSync(policyPath)).toBe(true);

    const sql = read(policyPath);
    expect(sql).toMatch(/CREATE SECURITY POLICY/i);
    expect(sql).toMatch(/ADD FILTER PREDICATE/i);
    expect(sql).toMatch(/ADD BLOCK PREDICATE/i);
    expect(sql).toMatch(/STATE = ON/i);
  });

  it('uses the same two session-context keys on both sides', () => {
    const ts = read(rlsContextPath);
    const sql = read(policyPath);

    // The application sets exactly these keys...
    expect(ts).toMatch(/@key=N'customer_id'/);
    expect(ts).toMatch(/@key=N'see_all'/);

    // ...and the predicates must read the same two names, or isolation is
    // keyed on something nothing sets and every query returns zero rows.
    expect(sql).toMatch(/SESSION_CONTEXT\(N'customer_id'\)/);
    expect(sql).toMatch(/SESSION_CONTEXT\(N'see_all'\)/);
  });

  it('separates the read predicate from the write predicate', () => {
    const sql = read(policyPath);

    expect(sql).toMatch(/fn_rls_tenant_read/);
    expect(sql).toMatch(/fn_rls_tenant_write/);

    const readStart = sql.indexOf('CREATE OR ALTER FUNCTION dbo.fn_rls_tenant_read');
    const writeStart = sql.indexOf('CREATE OR ALTER FUNCTION dbo.fn_rls_tenant_write');
    const readFn = sql.slice(readStart, writeStart);
    const writeFn = sql.slice(writeStart, sql.indexOf('-- Default every tenant column'));

    // Shared reference data comes in two inherited flavours and the read
    // predicate must admit both. 27 query sites in the API read
    // `customer_id = @cid OR customer_id IS NULL`, so dropping the NULL branch
    // would silently blank every tenant's system rules and code crosswalks
    // while the tables still looked populated to a database owner.
    expect(readFn).toMatch(/@customer_id IS NULL/);
    expect(readFn).toMatch(/@customer_id = 0/);

    // The write predicate must accept neither. A tenant that could insert a
    // NULL or a 0 row could put rows into every other tenant's view.
    expect(writeFn).not.toMatch(/@customer_id IS NULL/);
    expect(writeFn).not.toMatch(/@customer_id = 0/);

    // FILTER is the read path, BLOCK is the write path. Crossing them would
    // silently hide the sentinel or expose the write channel.
    expect(sql).toMatch(/ADD FILTER PREDICATE dbo\.fn_rls_tenant_read/);
    expect(sql).toMatch(/ADD BLOCK PREDICATE dbo\.fn_rls_tenant_write/);
    expect(sql).not.toMatch(/ADD FILTER PREDICATE dbo\.fn_rls_tenant_write/);
    expect(sql).not.toMatch(/ADD BLOCK PREDICATE dbo\.fn_rls_tenant_read/);
  });

  it('never grants the application login db_owner', () => {
    const sql = read(appLoginPath);

    // db_owner is exempt from both predicates, so granting it to the login the
    // API uses would disable the database half entirely.
    expect(sql).not.toMatch(/db_owner ADD MEMBER/i);
    expect(sql).toMatch(/db_datareader ADD MEMBER/i);
    expect(sql).toMatch(/db_datawriter ADD MEMBER/i);

    // And it refuses to finish if something else has granted it.
    expect(sql).toMatch(/RAISERROR/i);
  });
});

describe('tenantContextMiddleware fails closed', () => {
  // Imported lazily: the module installs an AsyncLocalStorage on load.
  function middleware() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../modules/rls-context');
  }

  it('does not grant see_all to an actor with no tenant', () => {
    const { tenantContextMiddleware, getTenantContext } = middleware();

    let seen: any;
    tenantContextMiddleware({ actor: { customer_id: null } }, {}, () => {
      seen = getTenantContext();
    });

    expect(seen).toEqual({ customerId: null, seeAll: false });
  });

  it('does not grant see_all when there is no actor at all', () => {
    const { tenantContextMiddleware, getTenantContext } = middleware();

    let seen: any;
    tenantContextMiddleware({}, {}, () => {
      seen = getTenantContext();
    });

    expect(seen).toEqual({ customerId: null, seeAll: false });
  });

  it('grants see_all only to an actor that holds the privilege', () => {
    const { tenantContextMiddleware, getTenantContext } = middleware();

    let superAdmin: any;
    tenantContextMiddleware({ actor: { customer_id: 4, isSuperAdmin: true } }, {}, () => {
      superAdmin = getTenantContext();
    });
    expect(superAdmin).toEqual({ customerId: 4, seeAll: true });

    let ordinary: any;
    tenantContextMiddleware({ actor: { customer_id: 4 } }, {}, () => {
      ordinary = getTenantContext();
    });
    expect(ordinary).toEqual({ customerId: 4, seeAll: false });
  });

  it('carries the tenant into the session-context prefix of every query', () => {
    const { runWithTenant, installRls } = middleware();

    const issued: string[] = [];
    const pool = {
      request: () => ({ query: (text: string) => { issued.push(text); return Promise.resolve({}); } }),
    };
    installRls(pool);

    runWithTenant({ customerId: 9, seeAll: false }, () => {
      pool.request().query('SELECT 1');
    });

    expect(issued).toHaveLength(1);
    expect(issued[0]).toContain("@key=N'customer_id', @value=9");
    expect(issued[0]).toContain("@key=N'see_all', @value=NULL");
    expect(issued[0]).toContain('SELECT 1');
  });

  it('sets customer_id NULL outside any request context', () => {
    const { installRls } = middleware();

    const issued: string[] = [];
    const pool = {
      request: () => ({ query: (text: string) => { issued.push(text); return Promise.resolve({}); } }),
    };
    installRls(pool);

    pool.request().query('SELECT 1');

    // With no context and no see_all, the predicate matches nothing. That is
    // the intended failure mode: zero rows, not every row.
    expect(issued[0]).toContain("@key=N'customer_id', @value=NULL");
    expect(issued[0]).toContain("@key=N'see_all', @value=NULL");
  });
});
