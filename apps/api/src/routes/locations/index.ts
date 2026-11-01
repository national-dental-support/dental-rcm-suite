import express from 'express';
import { requireRole } from '../../middleware/require-role';
import { locationsController } from '../../controllers/locations';
import sql from 'mssql';
import Database from '../../modules/db';

const router = express.Router();

// GET /api/locations - locations for global filter dropdowns (OrgLocation only)
router.get('/', async (req, res) => {
  try {
    const pool = Database.getInstance().getPool();
    const xenCustId = req.headers['x-xen-customer-id'] as string | undefined;
    const custId = xenCustId ? parseInt(xenCustId, 10) : (req as any).actor?.customer_id;
    const request = pool.request();

    let whereClause = 'WHERE ISNULL(ol.is_active,1) = 1 AND ISNULL(op.is_active,1) = 1';
    if (custId) {
      request.input('cid', sql.Int, custId);
      whereClause += ' AND pg.customer_id = @cid';
    }

    const result = await request.query(`
      SELECT DISTINCT ol.name
      FROM dbo.OrgLocation ol
      JOIN dbo.OrgPractice op ON op.id = ol.practice_id
      JOIN dbo.PracticeGroup pg ON pg.id = op.group_id
      ${whereClause}
      ORDER BY ol.name
    `);
    res.json({ data: result.recordset.map((r: any) => r.name) });
  } catch {
    res.status(500).json({ data: [] });
  }
});

// OpenDental edi_facilities locations (used for analytics / filter dropdowns)
router.post('/all', locationsController.get);

// -- Managed Locations (Locations DB table) ----------------------------------
// Admin-curated list that drives the provisioning form.

router.get('/managed', requireRole('Admin'), async (req, res) => {
  const pool = Database.getInstance().getPool();
  const custId = (req as any).actor?.customer_id;
  if (!custId) return res.status(403).json({ message: 'Unable to determine your tenant.' });
  try {
    const result = await pool.request()
      .input('cid', sql.Int, custId)
      .query(`
        SELECT uid, name, street_1, street_2, city, state, zip,
               primary_contact_first_name, primary_contact_last_name,
               primary_contact_email, primary_contact_phone_number,
               practice_id, customer_id
        FROM Locations
        WHERE customer_id = @cid
        ORDER BY name ASC
      `);
    return res.json({ data: result.recordset });
  } catch (err) {
    return res.status(500).json({ message: 'Error fetching locations' });
  }
});

router.post('/managed', requireRole('Admin'), async (req, res) => {
  const pool = Database.getInstance().getPool();
  const {
    name, street_1, street_2, city, state, zip,
    primary_contact_first_name, primary_contact_last_name,
    primary_contact_email, primary_contact_phone_number,
    practice_id, customer_id,
  } = req.body;

  if (!name) return res.status(400).json({ message: 'name is required' });

  try {
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('street_1', sql.NVarChar, street_1 ?? null)
      .input('street_2', sql.NVarChar, street_2 ?? null)
      .input('city', sql.NVarChar, city ?? null)
      .input('state', sql.NVarChar, state ?? null)
      .input('zip', sql.NVarChar, zip ?? null)
      .input('pcfn', sql.NVarChar, primary_contact_first_name ?? null)
      .input('pcln', sql.NVarChar, primary_contact_last_name ?? null)
      .input('pce', sql.NVarChar, primary_contact_email ?? null)
      .input('pcp', sql.NVarChar, primary_contact_phone_number ?? null)
      .input('practice_id', sql.Int, practice_id ?? null)
      .input('customer_id', sql.Int, customer_id ?? null)
      .query(`
        INSERT INTO Locations (
          name, street_1, street_2, city, state, zip,
          primary_contact_first_name, primary_contact_last_name,
          primary_contact_email, primary_contact_phone_number,
          practice_id, customer_id
        )
        OUTPUT INSERTED.*
        VALUES (
          @name, @street_1, @street_2, @city, @state, @zip,
          @pcfn, @pcln, @pce, @pcp,
          @practice_id, @customer_id
        )
      `);
    return res.status(201).json({ data: result.recordset[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Error creating location' });
  }
});

router.patch('/managed/:uid', requireRole('Admin'), async (req, res) => {
  const pool = Database.getInstance().getPool();
  const uid = parseInt(req.params['uid'], 10);
  if (isNaN(uid)) return res.status(400).json({ message: 'Invalid uid' });

  const {
    name, street_1, street_2, city, state, zip,
    primary_contact_first_name, primary_contact_last_name,
    primary_contact_email, primary_contact_phone_number,
  } = req.body;

  try {
    const result = await pool.request()
      .input('uid', sql.SmallInt, uid)
      .input('name', sql.NVarChar, name ?? null)
      .input('street_1', sql.NVarChar, street_1 ?? null)
      .input('street_2', sql.NVarChar, street_2 ?? null)
      .input('city', sql.NVarChar, city ?? null)
      .input('state', sql.NVarChar, state ?? null)
      .input('zip', sql.NVarChar, zip ?? null)
      .input('pcfn', sql.NVarChar, primary_contact_first_name ?? null)
      .input('pcln', sql.NVarChar, primary_contact_last_name ?? null)
      .input('pce', sql.NVarChar, primary_contact_email ?? null)
      .input('pcp', sql.NVarChar, primary_contact_phone_number ?? null)
      .query(`
        UPDATE Locations
        SET
          name                       = COALESCE(@name, name),
          street_1                   = COALESCE(@street_1, street_1),
          street_2                   = @street_2,
          city                       = COALESCE(@city, city),
          state                      = COALESCE(@state, state),
          zip                        = COALESCE(@zip, zip),
          primary_contact_first_name = COALESCE(@pcfn, primary_contact_first_name),
          primary_contact_last_name  = COALESCE(@pcln, primary_contact_last_name),
          primary_contact_email      = COALESCE(@pce, primary_contact_email),
          primary_contact_phone_number = COALESCE(@pcp, primary_contact_phone_number)
        WHERE uid = @uid
      `);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Location not found' });
    return res.json({ message: 'Location updated' });
  } catch (err) {
    return res.status(500).json({ message: 'Error updating location' });
  }
});

router.delete('/managed/:uid', requireRole('Admin'), async (req, res) => {
  const pool = Database.getInstance().getPool();
  const uid = parseInt(req.params['uid'], 10);
  if (isNaN(uid)) return res.status(400).json({ message: 'Invalid uid' });

  try {
    const result = await pool.request()
      .input('uid', sql.SmallInt, uid)
      .query(`DELETE FROM Locations WHERE uid = @uid`);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Location not found' });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: 'Error deleting location' });
  }
});

export default router;
