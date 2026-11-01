import { Router } from 'express';
import sql from 'mssql';
import { requireRole } from '../../../middleware/require-role';
import Database from '../../../modules/db';
import logger from '../../../utils/logger';

const router = Router();
const pool = Database.getInstance().getPool();

/**
 * GET /api/denial-iq/admin/groups
 * List practice groups for the current customer.
 * Includes locations array and assigned admin names per group.
 */
router.get('/', requireRole('Manager'), async (req, res) => {
  try {
    const actor = (req as any).actor;
    const isSuperAdmin = actor?.role === 'Super Admin';
    const xenCustId = req.headers['x-xen-customer-id'] ? parseInt(req.headers['x-xen-customer-id'] as string) : null;
    const customerId = (isSuperAdmin && xenCustId) ? xenCustId : actor?.customer_id;
    const shouldFilterTenant = (!isSuperAdmin && customerId) || (isSuperAdmin && xenCustId);

    const request = pool.request();
    let whereClause = 'WHERE 1=1';
    if (shouldFilterTenant) {
      request.input('customerId', sql.Int, customerId);
      whereClause += ' AND pg.customer_id = @customerId';
    }

    const result = await request.query(`
      SELECT
        pg.id,
        pg.name,
        pg.customer_id,
        ISNULL(pg.is_active, 1) AS is_active,
        pg.created_at,
        pg.updated_at
      FROM dbo.PracticeGroup pg
      ${whereClause}
      ORDER BY pg.name
    `);

    const groups = result.recordset;

    // Load locations and members for each group
    for (const group of groups) {
      const locResult = await pool.request()
        .input('groupId', sql.Int, group.id)
        .query(`
          SELECT id, location_name
          FROM dbo.GroupLocation
          WHERE group_id = @groupId
        `);
      group.locations = locResult.recordset;

      const memberResult = await pool.request()
        .input('groupId', sql.Int, group.id)
        .query(`
          SELECT uga.user_id, u.FirstName + ' ' + u.LastName AS name, u.Email AS email, u.Role AS role
          FROM dbo.UserGroupAssignment uga
          JOIN dbo.Users u ON u.userID = uga.user_id
          WHERE uga.group_id = @groupId
            AND ISNULL(u.disabled, 0) = 0 AND ISNULL(u.archived, 0) = 0
        `);
      group.members = memberResult.recordset;
    }

    return res.json({ data: groups });
  } catch (err) {
    logger.error(`GET /api/denial-iq/admin/groups error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/denial-iq/admin/groups
 * Create a new practice group for the current customer.
 * Body: { name: string }
 */
router.post('/', requireRole('Admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !(name as string).trim()) {
      return res.status(400).json({ message: 'name is required.' });
    }

    const actor = (req as any).actor;
    const customerId = actor?.customer_id;

    if (!customerId && actor?.role !== 'Super Admin') {
      return res.status(400).json({ message: 'Cannot determine customer context.' });
    }

    const result = await pool.request()
      .input('customerId', sql.Int, customerId)
      .input('name', sql.NVarChar(255), (name as string).trim())
      .query(`
        INSERT INTO dbo.PracticeGroup (customer_id, name, is_active, created_at, updated_at)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.customer_id, INSERTED.is_active, INSERTED.created_at
        VALUES (@customerId, @name, 1, GETUTCDATE(), GETUTCDATE())
      `);

    return res.status(201).json({ data: result.recordset[0] });
  } catch (err) {
    logger.error(`POST /api/denial-iq/admin/groups error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * PUT /api/denial-iq/admin/groups/:id
 * Update a practice group.
 * Body: { name?: string, is_active?: boolean }
 */
router.put('/:id', requireRole('Admin'), async (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    if (isNaN(groupId)) return res.status(400).json({ message: 'Invalid group id.' });

    const { name, is_active } = req.body;
    const actor = (req as any).actor;

    // Verify group belongs to actor's tenant
    if (actor?.role !== 'Super Admin') {
      const check = await pool.request()
        .input('id', sql.Int, groupId)
        .input('customerId', sql.Int, actor?.customer_id)
        .query(`SELECT 1 FROM dbo.PracticeGroup WHERE id = @id AND customer_id = @customerId`);
      if (!check.recordset.length) {
        return res.status(403).json({ message: 'Forbidden: group does not belong to your organization.' });
      }
    }

    const setClauses: string[] = [];
    const request = pool.request();
    request.input('id', sql.Int, groupId);

    if (name !== undefined) {
      request.input('name', sql.NVarChar(255), (name as string).trim());
      setClauses.push('name = @name');
    }
    if (is_active !== undefined) {
      request.input('isActive', sql.Bit, is_active ? 1 : 0);
      setClauses.push('is_active = @isActive');
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ message: 'No fields to update.' });
    }

    setClauses.push('updated_at = GETUTCDATE()');

    await request.query(`
      UPDATE dbo.PracticeGroup
      SET ${setClauses.join(', ')}
      WHERE id = @id
    `);

    return res.json({ message: 'Group updated.' });
  } catch (err) {
    logger.error(`PUT /api/denial-iq/admin/groups/:id error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/denial-iq/admin/groups/:id/locations
 * List locations in a group.
 */
router.get('/:id/locations', requireRole('Manager'), async (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    if (isNaN(groupId)) return res.status(400).json({ message: 'Invalid group id.' });

    const result = await pool.request()
      .input('groupId', sql.Int, groupId)
      .query(`
        SELECT id, group_id, location_name
        FROM dbo.GroupLocation
        WHERE group_id = @groupId
        ORDER BY location_name
      `);

    return res.json({ data: result.recordset });
  } catch (err) {
    logger.error(`GET /api/denial-iq/admin/groups/:id/locations error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/denial-iq/admin/groups/:id/locations
 * Add a location to a group.
 * Body: { location_name: string }
 */
router.post('/:id/locations', requireRole('Admin'), async (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    if (isNaN(groupId)) return res.status(400).json({ message: 'Invalid group id.' });

    const { location_name } = req.body;
    if (!location_name || !(location_name as string).trim()) {
      return res.status(400).json({ message: 'location_name is required.' });
    }

    const actor = (req as any).actor;
    // Verify group belongs to actor's tenant
    if (actor?.role !== 'Super Admin') {
      const check = await pool.request()
        .input('id', sql.Int, groupId)
        .input('customerId', sql.Int, actor?.customer_id)
        .query(`SELECT 1 FROM dbo.PracticeGroup WHERE id = @id AND customer_id = @customerId`);
      if (!check.recordset.length) {
        return res.status(403).json({ message: 'Forbidden: group does not belong to your organization.' });
      }
    }

    const result = await pool.request()
      .input('groupId', sql.Int, groupId)
      .input('locationName', sql.NVarChar(255), (location_name as string).trim())
      .query(`
        INSERT INTO dbo.GroupLocation (group_id, location_name)
        OUTPUT INSERTED.id, INSERTED.group_id, INSERTED.location_name
        VALUES (@groupId, @locationName)
      `);

    return res.status(201).json({ data: result.recordset[0] });
  } catch (err) {
    logger.error(`POST /api/denial-iq/admin/groups/:id/locations error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * DELETE /api/denial-iq/admin/groups/:id/locations/:locId
 * Remove a location from a group.
 */
router.delete('/:id/locations/:locId', requireRole('Admin'), async (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const locId = parseInt(req.params.locId, 10);
    if (isNaN(groupId) || isNaN(locId)) {
      return res.status(400).json({ message: 'Invalid group or location id.' });
    }

    const actor = (req as any).actor;
    if (actor?.role !== 'Super Admin') {
      const check = await pool.request()
        .input('id', sql.Int, groupId)
        .input('customerId', sql.Int, actor?.customer_id)
        .query(`SELECT 1 FROM dbo.PracticeGroup WHERE id = @id AND customer_id = @customerId`);
      if (!check.recordset.length) {
        return res.status(403).json({ message: 'Forbidden: group does not belong to your organization.' });
      }
    }

    await pool.request()
      .input('locId', sql.Int, locId)
      .input('groupId', sql.Int, groupId)
      .query(`DELETE FROM dbo.GroupLocation WHERE id = @locId AND group_id = @groupId`);

    return res.json({ message: 'Location removed from group.' });
  } catch (err) {
    logger.error(`DELETE /api/denial-iq/admin/groups/:id/locations/:locId error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/denial-iq/admin/groups/:id/members
 * List users assigned to a group.
 */
router.get('/:id/members', requireRole('Manager'), async (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    if (isNaN(groupId)) return res.status(400).json({ message: 'Invalid group id.' });

    const result = await pool.request()
      .input('groupId', sql.Int, groupId)
      .query(`
        SELECT
          uga.user_id,
          u.FirstName + ' ' + u.LastName AS name,
          u.Email AS email,
          u.Role AS role
        FROM dbo.UserGroupAssignment uga
        JOIN dbo.Users u ON u.userID = uga.user_id
        WHERE uga.group_id = @groupId
          AND ISNULL(u.disabled, 0) = 0 AND ISNULL(u.archived, 0) = 0
        ORDER BY u.FirstName, u.LastName
      `);

    return res.json({ data: result.recordset });
  } catch (err) {
    logger.error(`GET /api/denial-iq/admin/groups/:id/members error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/denial-iq/admin/groups/:id/members
 * Assign a user to a group.
 * Body: { user_id: number }
 */
router.post('/:id/members', requireRole('Admin'), async (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    if (isNaN(groupId)) return res.status(400).json({ message: 'Invalid group id.' });

    const { user_id } = req.body;
    if (!user_id || isNaN(Number(user_id))) {
      return res.status(400).json({ message: 'user_id is required and must be a number.' });
    }

    const actor = (req as any).actor;
    if (actor?.role !== 'Super Admin') {
      const check = await pool.request()
        .input('id', sql.Int, groupId)
        .input('customerId', sql.Int, actor?.customer_id)
        .query(`SELECT 1 FROM dbo.PracticeGroup WHERE id = @id AND customer_id = @customerId`);
      if (!check.recordset.length) {
        return res.status(403).json({ message: 'Forbidden: group does not belong to your organization.' });
      }
    }

    // Check if assignment already exists
    const existing = await pool.request()
      .input('groupId', sql.Int, groupId)
      .input('userId', sql.Int, Number(user_id))
      .query(`SELECT 1 FROM dbo.UserGroupAssignment WHERE group_id = @groupId AND user_id = @userId`);

    if (existing.recordset.length > 0) {
      return res.status(409).json({ message: 'User is already assigned to this group.' });
    }

    await pool.request()
      .input('groupId', sql.Int, groupId)
      .input('userId', sql.Int, Number(user_id))
      .query(`
        INSERT INTO dbo.UserGroupAssignment (group_id, user_id)
        VALUES (@groupId, @userId)
      `);

    return res.status(201).json({ message: 'User assigned to group.' });
  } catch (err) {
    logger.error(`POST /api/denial-iq/admin/groups/:id/members error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * DELETE /api/denial-iq/admin/groups/:id/members/:userId
 * Remove a user from a group.
 */
router.delete('/:id/members/:userId', requireRole('Admin'), async (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(groupId) || isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid group or user id.' });
    }

    const actor = (req as any).actor;
    if (actor?.role !== 'Super Admin') {
      const check = await pool.request()
        .input('id', sql.Int, groupId)
        .input('customerId', sql.Int, actor?.customer_id)
        .query(`SELECT 1 FROM dbo.PracticeGroup WHERE id = @id AND customer_id = @customerId`);
      if (!check.recordset.length) {
        return res.status(403).json({ message: 'Forbidden: group does not belong to your organization.' });
      }
    }

    await pool.request()
      .input('groupId', sql.Int, groupId)
      .input('userId', sql.Int, userId)
      .query(`DELETE FROM dbo.UserGroupAssignment WHERE group_id = @groupId AND user_id = @userId`);

    return res.json({ message: 'User removed from group.' });
  } catch (err) {
    logger.error(`DELETE /api/denial-iq/admin/groups/:id/members/:userId error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
