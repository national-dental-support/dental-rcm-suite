/**
 * Admin Catalog Routes - /api/admin/catalog/:type
 *
 * Manages the LocationCatalog, ProviderCatalog, and PayerCatalog tables.
 * Items are sourced from recon_report via sync and can be manually added.
 * Only 'active' items flow to the global filter and provisioning form.
 *
 * Alias routes (DataAliasMapping):
 *   GET    /:type/aliases         - list all alias mappings for a type
 *   POST   /:type/map             - map a dirty name to a canonical name
 *   DELETE /:type/aliases/:id     - remove an alias (dirty name re-appears on next sync)
 *
 * type: 'location' | 'provider' | 'payer'
 */
import express from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import { requireRole } from '../../middleware/require-role';

const router = express.Router();

const TABLE: Record<string, string> = {
  location: 'LocationCatalog',
  provider: 'ProviderCatalog',
  payer:    'PayerCatalog',
};

/** SQL to discover distinct names from recon_report for each catalog type */
const DISCOVER_QUERY: Record<string, string> = {
  location: `SELECT DISTINCT Location        AS name FROM dbo.recon_report WHERE Location      IS NOT NULL AND Location      != ''`,
  provider: `SELECT DISTINCT ProviderName    AS name FROM dbo.recon_report WHERE ProviderName   IS NOT NULL AND ProviderName   != ''`,
  payer:    `SELECT DISTINCT InsuranceName   AS name FROM dbo.recon_report WHERE InsuranceName  IS NOT NULL AND InsuranceName  != ''`,
};

function validType(type: string): type is keyof typeof TABLE {
  return type in TABLE;
}

// -- List aliases --------------------------------------------------------------
// GET /api/admin/catalog/:type/aliases
router.get('/:type/aliases', requireRole('Admin'), async (req, res) => {
  const { type } = req.params;
  if (!validType(type)) return res.status(400).json({ message: 'Invalid type.' });

  const pool = Database.getInstance().getPool();
  try {
    const result = await pool.request()
      .input('entityType', sql.NVarChar, type)
      .query(`
        SELECT id, entity_type, dirty_name, canonical_name, created_by, created_at
        FROM dbo.DataAliasMapping
        WHERE entity_type = @entityType
        ORDER BY dirty_name ASC
      `);
    return res.json({ data: result.recordset });
  } catch (err) {
    return res.status(500).json({ message: 'Error fetching aliases' });
  }
});

// -- List catalog items --------------------------------------------------------
// GET /api/admin/catalog/:type?status=pending|active|archived
router.get('/:type', requireRole('Admin'), async (req, res) => {
  const { type } = req.params;
  if (!validType(type)) return res.status(400).json({ message: 'Invalid type. Must be location, provider, or payer.' });

  const pool = Database.getInstance().getPool();
  const statusFilter = req.query['status'] as string | undefined;

  try {
    const base = `SELECT id, name, status, source, created_at, updated_at FROM ${TABLE[type]}`;
    let result;
    if (statusFilter && ['pending', 'active', 'archived'].includes(statusFilter)) {
      result = await pool.request()
        .input('status', sql.NVarChar, statusFilter)
        .query(`${base} WHERE status = @status ORDER BY name ASC`);
    } else {
      result = await pool.request().query(`${base} ORDER BY name ASC`);
    }
    return res.json({ data: result.recordset });
  } catch (err) {
    return res.status(500).json({ message: 'Error fetching catalog', });
  }
});

// -- Sync from recon_report ----------------------------------------------------
// POST /api/admin/catalog/:type/sync
router.post('/:type/sync', requireRole('Admin'), async (req, res) => {
  const { type } = req.params;
  if (!validType(type)) return res.status(400).json({ message: 'Invalid type.' });

  const pool = Database.getInstance().getPool();
  const table = TABLE[type];
  const discoverSql = DISCOVER_QUERY[type];

  try {
    // First sync? -> approve immediately so existing filters aren't disrupted
    const countResult = await pool.request().query(`SELECT COUNT(*) AS cnt FROM ${table}`);
    const isFirstSync = (countResult.recordset[0] as any).cnt === 0;
    const defaultStatus = isFirstSync ? 'active' : 'pending';

    const insertResult = await pool.request()
      .input('status', sql.NVarChar, defaultStatus)
      .input('entityType', sql.NVarChar, type)
      .query(`
        INSERT INTO ${table} (name, status, source)
        SELECT src.name, @status, 'recon_report'
        FROM (${discoverSql}) AS src
        WHERE NOT EXISTS (
          SELECT 1 FROM ${table} WHERE LOWER(name) = LOWER(src.name)
        )
        AND NOT EXISTS (
          SELECT 1 FROM dbo.DataAliasMapping
          WHERE entity_type = @entityType AND LOWER(dirty_name) = LOWER(src.name)
        )
      `);

    const added = insertResult.rowsAffected[0] ?? 0;

    const summary = await pool.request().query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'active'   THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived
      FROM ${table}
    `);

    return res.json({ added, isFirstSync, ...summary.recordset[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Error syncing catalog', });
  }
});

// -- Map a pending dirty name to a canonical name ------------------------------
// POST /api/admin/catalog/:type/map
// Body: { dirty_name: string, canonical_name: string }
router.post('/:type/map', requireRole('Admin'), async (req, res) => {
  const { type } = req.params;
  if (!validType(type)) return res.status(400).json({ message: 'Invalid type.' });

  const dirty_name    = (req.body.dirty_name    ?? '').trim();
  const canonical_name = (req.body.canonical_name ?? '').trim();
  if (!dirty_name || !canonical_name) {
    return res.status(400).json({ message: 'dirty_name and canonical_name are required.' });
  }

  const createdBy = (req.headers['x-actor-email'] as string) ?? null;
  const pool = Database.getInstance().getPool();
  const table = TABLE[type];

  try {
    // 1. Validate canonical name exists (any non-archived status)
    const canonicalCheck = await pool.request()
      .input('canonical', sql.NVarChar, canonical_name)
      .query(`SELECT id, status FROM ${table} WHERE LOWER(name) = LOWER(@canonical) AND status != 'archived'`);

    if (canonicalCheck.recordset.length === 0) {
      return res.status(422).json({ message: `"${canonical_name}" was not found in the ${type} catalog.` });
    }

    // Auto-approve the canonical if it is still pending
    const canonicalRow = canonicalCheck.recordset[0] as { id: number; status: string };
    if (canonicalRow.status === 'pending') {
      await pool.request()
        .input('canonicalId', sql.Int, canonicalRow.id)
        .query(`UPDATE ${table} SET status = 'active', updated_at = GETUTCDATE() WHERE id = @canonicalId`);
    }

    // 2. Insert alias (or update if dirty_name already has a mapping)
    const aliasResult = await pool.request()
      .input('entityType',    sql.NVarChar, type)
      .input('dirtyName',     sql.NVarChar, dirty_name)
      .input('canonicalName', sql.NVarChar, canonical_name)
      .input('createdBy',     sql.NVarChar, createdBy)
      .query(`
        MERGE dbo.DataAliasMapping AS target
        USING (SELECT @entityType AS entity_type, @dirtyName AS dirty_name) AS source
          ON target.entity_type = source.entity_type AND LOWER(target.dirty_name) = LOWER(source.dirty_name)
        WHEN MATCHED THEN
          UPDATE SET canonical_name = @canonicalName, created_by = @createdBy, created_at = GETUTCDATE()
        WHEN NOT MATCHED THEN
          INSERT (entity_type, dirty_name, canonical_name, created_by)
          VALUES (@entityType, @dirtyName, @canonicalName, @createdBy)
        OUTPUT INSERTED.id;
      `);

    const aliasId = (aliasResult.recordset[0] as any)?.id;

    // 3. Remove the dirty name from catalog if it's pending (it's now represented by alias)
    await pool.request()
      .input('dirtyName', sql.NVarChar, dirty_name)
      .query(`DELETE FROM ${table} WHERE LOWER(name) = LOWER(@dirtyName) AND status = 'pending'`);

    return res.json({ mapped: true, aliasId });
  } catch (err: any) {
    return res.status(500).json({ message: 'Error creating alias mapping' });
  }
});

// -- Manually add an item ------------------------------------------------------
// POST /api/admin/catalog/:type
router.post('/:type', requireRole('Admin'), async (req, res) => {
  const { type } = req.params;
  if (!validType(type)) return res.status(400).json({ message: 'Invalid type.' });

  const name = (req.body.name ?? '').trim();
  if (!name) return res.status(400).json({ message: 'name is required.' });

  const pool = Database.getInstance().getPool();
  try {
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .query(`
        INSERT INTO ${TABLE[type]} (name, status, source)
        OUTPUT INSERTED.*
        VALUES (@name, 'active', 'manual')
      `);
    return res.status(201).json({ data: result.recordset[0] });
  } catch (err: any) {
    if (err.number === 2627 || String(err).includes('UNIQUE') || String(err).includes('duplicate')) {
      return res.status(409).json({ message: `"${name}" already exists in the catalog.` });
    }
    return res.status(500).json({ message: 'Internal server error'});
  }
});

// -- Update single item status -------------------------------------------------
// PATCH /api/admin/catalog/:type/:id
router.patch('/:type/:id', requireRole('Admin'), async (req, res) => {
  const { type, id: idParam } = req.params;
  if (!validType(type)) return res.status(400).json({ message: 'Invalid type.' });

  const id = parseInt(idParam, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const { status } = req.body;
  if (!['pending', 'active', 'archived'].includes(status)) {
    return res.status(400).json({ message: 'status must be pending, active, or archived.' });
  }

  const pool = Database.getInstance().getPool();
  try {
    const result = await pool.request()
      .input('id',     sql.Int,      id)
      .input('status', sql.NVarChar, status)
      .query(`UPDATE ${TABLE[type]} SET status = @status, updated_at = GETUTCDATE() WHERE id = @id`);

    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Item not found.' });
    return res.json({ message: 'Status updated.' });
  } catch (err) {
    return res.status(500).json({ message: 'Error updating status', });
  }
});

// -- Bulk update status --------------------------------------------------------
// PATCH /api/admin/catalog/:type  { ids: number[], status: string }
router.patch('/:type', requireRole('Admin'), async (req, res) => {
  const { type } = req.params;
  if (!validType(type)) return res.status(400).json({ message: 'Invalid type.' });

  const { ids, status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'ids array is required.' });
  if (!['pending', 'active', 'archived'].includes(status)) return res.status(400).json({ message: 'Invalid status.' });

  const safeIds = ids.map((v: unknown) => parseInt(String(v), 10)).filter(n => !isNaN(n));
  if (!safeIds.length) return res.status(400).json({ message: 'No valid ids provided.' });

  const pool = Database.getInstance().getPool();
  try {
    await pool.request()
      .input('status', sql.NVarChar, status)
      .query(`UPDATE ${TABLE[type]} SET status = @status, updated_at = GETUTCDATE() WHERE id IN (${safeIds.join(',')})`);

    return res.json({ message: `Updated ${safeIds.length} item(s) to "${status}".` });
  } catch (err) {
    return res.status(500).json({ message: 'Error bulk updating', });
  }
});

// -- Delete an alias -----------------------------------------------------------
// DELETE /api/admin/catalog/:type/aliases/:id
router.delete('/:type/aliases/:id', requireRole('Admin'), async (req, res) => {
  const { type, id: idParam } = req.params;
  if (!validType(type)) return res.status(400).json({ message: 'Invalid type.' });

  const id = parseInt(idParam, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const pool = Database.getInstance().getPool();
  try {
    const result = await pool.request()
      .input('id',         sql.Int,      id)
      .input('entityType', sql.NVarChar, type)
      .query(`
        DELETE FROM dbo.DataAliasMapping
        WHERE id = @id AND entity_type = @entityType
      `);

    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Alias not found.' });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: 'Error deleting alias' });
  }
});

// -- Delete a manually-added item ---------------------------------------------
// DELETE /api/admin/catalog/:type/:id
router.delete('/:type/:id', requireRole('Admin'), async (req, res) => {
  const { type, id: idParam } = req.params;
  if (!validType(type)) return res.status(400).json({ message: 'Invalid type.' });

  const id = parseInt(idParam, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const pool = Database.getInstance().getPool();
  try {
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`DELETE FROM ${TABLE[type]} WHERE id = @id AND source = 'manual'`);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Item not found or cannot delete synced items (archive instead).' });
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: 'Error deleting item', });
  }
});

export default router;
