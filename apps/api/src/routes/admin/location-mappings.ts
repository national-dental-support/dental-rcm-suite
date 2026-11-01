import { Router } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import { requireRole } from '../../middleware/require-role';

const router = Router();

function getPool() {
  return Database.getInstance().getPool();
}

function custId(req: any): number | null {
  return req.actor?.customer_id ?? null;
}

// GET /api/admin/location-mappings - list all mappings for the caller's tenant
router.get('/', requireRole('Admin'), async (req, res) => {
  const cid = custId(req as any);
  if (!cid) return res.status(400).json({ message: 'customer_id required' });
  try {
    const result = await getPool().request()
      .input('cid', sql.Int, cid)
      .query(`
        SELECT
          lnm.id,
          lnm.entity_type   AS entityType,
          lnm.org_id        AS orgId,
          CASE lnm.entity_type
            WHEN 'practice' THEN op.name
            WHEN 'location' THEN ol.name
          END               AS orgName,
          lnm.recon_key     AS reconKey,
          lnm.is_active     AS isActive,
          lnm.updated_at    AS updatedAt
        FROM dbo.LocationNameMapping lnm
        LEFT JOIN dbo.OrgPractice op ON op.id = lnm.org_id AND lnm.entity_type = 'practice'
        LEFT JOIN dbo.OrgLocation ol ON ol.id = lnm.org_id AND lnm.entity_type = 'location'
        WHERE lnm.customer_id = @cid
        ORDER BY lnm.entity_type, orgName
      `);
    return res.json({ data: result.recordset });
  } catch (err: any) {
    return res.status(500).json({ message: 'Error fetching location mappings', error: err.message });
  }
});

// GET /api/admin/location-mappings/suggestions - org names + recon keys for add/edit forms
router.get('/suggestions', requireRole('Admin'), async (req, res) => {
  const cid = custId(req as any);
  if (!cid) return res.status(400).json({ message: 'customer_id required' });
  try {
    const pool = getPool();
    const [orgRes, reconRes] = await Promise.all([
      pool.request().input('cid', sql.Int, cid).query(`
        SELECT op.id, op.name, 'practice' AS entityType
        FROM dbo.OrgPractice op
        JOIN dbo.PracticeGroup pg ON pg.id = op.group_id AND pg.customer_id = @cid
        WHERE ISNULL(op.is_active,1) = 1
        UNION ALL
        SELECT ol.id, ol.name, 'location' AS entityType
        FROM dbo.OrgLocation ol
        JOIN dbo.OrgPractice op2 ON op2.id = ol.practice_id
        JOIN dbo.PracticeGroup pg2 ON pg2.id = op2.group_id AND pg2.customer_id = @cid
        WHERE ISNULL(ol.is_active,1) = 1
        ORDER BY entityType, name
      `),
      pool.request().input('cid', sql.Int, cid).query(`
        SELECT DISTINCT Operations AS reconKey, 'practice' AS entityType
        FROM dbo.recon_report
        WHERE Operations IS NOT NULL AND LTRIM(RTRIM(Operations)) <> '' AND customer_id = @cid
        UNION
        SELECT DISTINCT Location AS reconKey, 'location' AS entityType
        FROM dbo.recon_report
        WHERE Location IS NOT NULL AND LTRIM(RTRIM(Location)) <> '' AND customer_id = @cid
        ORDER BY entityType, reconKey
      `),
    ]);

    const orgLocations = orgRes.recordset
      .filter((r: any) => r.entityType === 'location')
      .map((r: any) => ({ id: r.id, name: r.name }));
    const orgPractices = orgRes.recordset
      .filter((r: any) => r.entityType === 'practice')
      .map((r: any) => ({ id: r.id, name: r.name }));
    const reconLocationKeys = reconRes.recordset
      .filter((r: any) => r.entityType === 'location')
      .map((r: any) => r.reconKey as string);
    const reconPracticeKeys = reconRes.recordset
      .filter((r: any) => r.entityType === 'practice')
      .map((r: any) => r.reconKey as string);

    return res.json({ orgLocations, orgPractices, reconLocationKeys, reconPracticeKeys });
  } catch (err: any) {
    return res.status(500).json({ message: 'Error fetching suggestions', error: err.message });
  }
});

// POST /api/admin/location-mappings - create a new mapping
router.post('/', requireRole('Admin'), async (req, res) => {
  const cid = custId(req as any);
  if (!cid) return res.status(400).json({ message: 'customer_id required' });

  const { entityType, orgId, reconKey } = req.body;
  if (!entityType || !orgId || !reconKey) {
    return res.status(400).json({ message: 'entityType, orgId, and reconKey are required' });
  }
  if (entityType !== 'practice' && entityType !== 'location') {
    return res.status(400).json({ message: 'entityType must be "practice" or "location"' });
  }

  try {
    const result = await getPool().request()
      .input('cid',        sql.Int,          cid)
      .input('entityType', sql.NVarChar(20),  entityType)
      .input('orgId',      sql.Int,          parseInt(orgId, 10))
      .input('reconKey',   sql.NVarChar(255), reconKey.trim())
      .query(`
        INSERT INTO dbo.LocationNameMapping (customer_id, entity_type, org_id, recon_key)
        OUTPUT INSERTED.*
        VALUES (@cid, @entityType, @orgId, @reconKey)
      `);
    return res.status(201).json({ data: result.recordset[0] });
  } catch (err: any) {
    if (err.number === 2627) {
      return res.status(409).json({ message: 'A mapping for this recon key already exists' });
    }
    return res.status(500).json({ message: 'Error creating mapping', error: err.message });
  }
});

// PATCH /api/admin/location-mappings/:id - update reconKey or isActive
router.patch('/:id', requireRole('Admin'), async (req, res) => {
  const cid = custId(req as any);
  if (!cid) return res.status(400).json({ message: 'customer_id required' });

  const id = parseInt(req.params['id'], 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });

  const { reconKey, isActive } = req.body;
  try {
    const result = await getPool().request()
      .input('id',       sql.Int,          id)
      .input('cid',      sql.Int,          cid)
      .input('reconKey', sql.NVarChar(255), reconKey?.trim() ?? null)
      .input('isActive', sql.Bit,          isActive !== undefined ? (isActive ? 1 : 0) : null)
      .query(`
        UPDATE dbo.LocationNameMapping
        SET
          recon_key  = COALESCE(@reconKey, recon_key),
          is_active  = COALESCE(@isActive, is_active),
          updated_at = GETUTCDATE()
        WHERE id = @id AND customer_id = @cid
      `);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Mapping not found' });
    return res.json({ message: 'Mapping updated' });
  } catch (err: any) {
    if (err.number === 2627) {
      return res.status(409).json({ message: 'A mapping for this recon key already exists' });
    }
    return res.status(500).json({ message: 'Error updating mapping', error: err.message });
  }
});

// DELETE /api/admin/location-mappings/:id - remove a mapping
router.delete('/:id', requireRole('Admin'), async (req, res) => {
  const cid = custId(req as any);
  if (!cid) return res.status(400).json({ message: 'customer_id required' });

  const id = parseInt(req.params['id'], 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });

  try {
    const result = await getPool().request()
      .input('id',  sql.Int, id)
      .input('cid', sql.Int, cid)
      .query(`DELETE FROM dbo.LocationNameMapping WHERE id = @id AND customer_id = @cid`);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Mapping not found' });
    return res.status(204).send();
  } catch (err: any) {
    return res.status(500).json({ message: 'Error deleting mapping', error: err.message });
  }
});

export default router;
