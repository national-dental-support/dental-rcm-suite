import { Request, Response, Router } from 'express';
import { requireRole } from '../../middleware/require-role';
import sql from 'mssql';
import Database from '../../modules/db';

const databaseInstance = Database.getInstance();
const pool = databaseInstance.getPool();
const router = Router();

function actorCustId(req: Request): number | null {
  return (req as any).actor?.customer_id ?? null;
}

// GET location assignments for a specific user (Admin only, same tenant)
router.post('/', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const user_id: string | undefined = req.body.user_id;
    const custId = actorCustId(req);

    if (!user_id) {
      return res.status(400).send({ message: 'user_id is required.' });
    }
    if (!custId) {
      return res.status(403).send({ message: 'Unable to determine your tenant.' });
    }

    const result = await pool.request()
      .input('user_id', sql.NVarChar, user_id)
      .input('custId', sql.Int, custId)
      .query(`
        SELECT
          la.user_id, la.role_id, la.location_id,
          u.email, u.first_name, u.last_name, u.archived
        FROM LocationAssignments la
        JOIN Users u ON la.user_id = u.uid
        WHERE la.user_id = @user_id
          AND u.customer_id = @custId
      `);

    res.status(200).send({ message: 'Connected successfully.', data: result.recordset });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error: ' + error });
  }
});

// GET location assignments for a specific user by email (Admin only, same tenant)
router.post('/get-all-by-email', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const email: string | undefined = req.body.email;
    const custId = actorCustId(req);

    if (!email) {
      return res.status(400).send({ message: 'email is required.' });
    }
    if (!custId) {
      return res.status(403).send({ message: 'Unable to determine your tenant.' });
    }

    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .input('custId', sql.Int, custId)
      .query(`
        SELECT
          la.user_id, la.role_id, la.location_id,
          u.email, u.first_name, u.last_name, u.archived
        FROM LocationAssignments la
        JOIN Users u ON la.email = u.email
        WHERE la.email = @email
          AND u.customer_id = @custId
      `);

    res.status(200).send({ message: 'Connected successfully.', data: result.recordset });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error: ' + error });
  }
});

// GET all users + location assignments for the actor's customer (Admin only)
router.post('/customer', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const custId = actorCustId(req);

    if (!custId) {
      return res.status(403).send({ message: 'Unable to determine your tenant.' });
    }

    const result = await pool.request()
      .input('customer_id', sql.Int, custId)
      .query(`
        SELECT
          u.first_name,
          u.last_name,
          u.email,
          u.created_at,
          u.disabled,
          u.customer_id,
          u.role_id,
          la.location_id
        FROM Users u
        LEFT JOIN LocationAssignments la ON u.email = la.email
        WHERE u.customer_id = @customer_id
          AND (u.archived IS NULL OR u.archived = 0)
      `);

    const modifiedResult = result.recordset.map((item: any) => ({
      ...item,
      archived: item.archived === null || item.archived === 0 ? 'Active' : 'Disabled',
      role_id: item.role_id || 0,
    }));

    res.status(200).send({ message: 'Connected successfully.', data: modifiedResult });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error: ' + error });
  }
});

// POST create location assignment(s) (Admin only, scoped to actor's tenant)
router.post('/create', requireRole('Admin'), async (req: Request, res: Response) => {
  const { location_id, role_id, email } = req.body;
  const custId = actorCustId(req);

  if (!custId) {
    return res.status(403).send({ message: 'Unable to determine your tenant.' });
  }
  if (!location_id || (typeof location_id !== 'string' && !Array.isArray(location_id))) {
    return res.status(400).send({ message: 'Invalid location_id format. Must be a string or array of strings.' });
  }
  if (!role_id) {
    return res.status(400).send({ message: 'role_id is required.' });
  }
  if (!email) {
    return res.status(400).send({ message: 'email is required.' });
  }

  const locationIds = typeof location_id === 'string' ? location_id.split(',') : location_id;

  try {
    // Verify user exists and belongs to actor's tenant
    const userExists = await pool.request()
      .input('email', sql.NVarChar, email)
      .input('custId', sql.Int, custId)
      .query(`SELECT * FROM Users WHERE email = @email AND customer_id = @custId`);

    if (userExists.recordset.length === 0) {
      return res.status(400).send({ message: 'No user found with that email in your organization.' });
    }

    // Verify each location exists and belongs to actor's tenant
    for (const locationId of locationIds) {
      const locationExists = await pool.request()
        .input('location_id', sql.NVarChar, locationId)
        .input('custId', sql.Int, custId)
        .query(`SELECT * FROM Locations WHERE uid = @location_id AND customer_id = @custId`);
      if (locationExists.recordset.length === 0) {
        return res.status(400).send({ message: `No location found with location_id: ${locationId} in your organization.` });
      }
    }

    // Check for existing assignments
    for (const locationId of locationIds) {
      const existing = await pool.request()
        .input('location_id', sql.NVarChar, locationId)
        .input('role_id', sql.NVarChar, role_id)
        .input('custId', sql.Int, custId)
        .input('email', sql.NVarChar, email)
        .query(`
          SELECT * FROM LocationAssignments
          WHERE location_id = @location_id
            AND role_id = @role_id
            AND customer_id = @custId
            AND email = @email
        `);
      if (existing.recordset.length > 0) {
        return res.status(409).send({ message: 'A location assignment with the same email, role_id, and location_id already exists.' });
      }
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      for (const locationId of locationIds) {
        await transaction.request()
          .input('location_id', sql.NVarChar, locationId)
          .input('role_id', sql.NVarChar, role_id)
          .input('custId', sql.Int, custId)
          .input('email', sql.NVarChar, email)
          .query(`
            INSERT INTO LocationAssignments (location_id, role_id, customer_id, email)
            VALUES (@location_id, @role_id, @custId, @email)
          `);
      }
      await transaction.commit();
      return res.status(201).send({ message: 'Location assignments created successfully.' });
    } catch (err) {
      await transaction.rollback();
      return res.status(500).send({ message: 'An error occurred while creating location assignments.' });
    }
  } catch (error) {
    return res.status(500).send({ message: 'An error occurred while creating the location assignment.' });
  }
});

// DELETE location assignment (Admin only, scoped to actor's tenant)
router.delete('/delete', requireRole('Admin'), async (req: Request, res: Response) => {
  const { location_id, email } = req.body;
  const custId = actorCustId(req);

  if (!custId) {
    return res.status(403).send({ message: 'Unable to determine your tenant.' });
  }
  if (!location_id) {
    return res.status(400).send({ message: 'location_id is required.' });
  }
  if (!email) {
    return res.status(400).send({ message: 'email is required.' });
  }

  try {
    // Verify user exists and belongs to actor's tenant
    const userExists = await pool.request()
      .input('email', sql.NVarChar, email)
      .input('custId', sql.Int, custId)
      .query(`SELECT * FROM Users WHERE email = @email AND customer_id = @custId`);

    if (userExists.recordset.length === 0) {
      return res.status(400).send({ message: 'No user found with that email in your organization.' });
    }

    // Verify location exists and belongs to actor's tenant
    const locationExists = await pool.request()
      .input('location_id', sql.NVarChar, location_id)
      .input('custId', sql.Int, custId)
      .query(`SELECT * FROM Locations WHERE uid = @location_id AND customer_id = @custId`);

    if (locationExists.recordset.length === 0) {
      return res.status(400).send({ message: 'No location found with that location_id in your organization.' });
    }

    await pool.request()
      .input('location_id', sql.NVarChar, location_id)
      .input('email', sql.NVarChar, email)
      .input('custId', sql.Int, custId)
      .query(`
        DELETE FROM LocationAssignments
        WHERE location_id = @location_id
          AND email = @email
          AND customer_id = @custId
      `);

    return res.status(201).send({ message: 'Location assignment deleted successfully.' });
  } catch (error) {
    return res.status(500).send({ message: 'An error occurred while deleting the location assignment.' });
  }
});

export default router;
