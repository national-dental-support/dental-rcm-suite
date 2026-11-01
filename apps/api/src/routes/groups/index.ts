import { Router } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import logger from '../../utils/logger';

const router = Router();
const pool = Database.getInstance().getPool();

/**
 * GET /api/groups
 * Hierarchy for global filter dropdowns.
 * Returns active groups -> practices -> locations for the caller's customer.
 * No role requirement - available to all authenticated users.
 */
router.get('/', async (req, res) => {
  try {
    // Resolve customer_id from x-actor-email header
    const actorEmail = (req.headers['x-actor-email'] as string | undefined)?.toLowerCase().trim();
    const actorOid = req.headers['x-actor-oid'] as string | undefined;

    if (!actorEmail && !actorOid) {
      return res.status(400).json({ message: 'x-actor-email or x-actor-oid header required.' });
    }

    // Look up the user to get customer_id, userID, Role
    const userRequest = pool.request();
    let userQuery = `SELECT TOP 1 userID, customer_id, Role FROM dbo.Users`;

    // Check if azure_oid column exists
    let hasOidCol = true;
    try {
      const colCheck = await pool.request().query(
        `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Users' AND COLUMN_NAME='azure_oid'`
      );
      hasOidCol = colCheck.recordset.length > 0;
    } catch { hasOidCol = false; }

    if (actorOid && hasOidCol) {
      userRequest.input('oid', sql.NVarChar(36), actorOid);
      if (actorEmail) {
        userRequest.input('email', sql.NVarChar, actorEmail);
        userQuery += ` WHERE azure_oid = @oid OR LOWER(Email) = @email ORDER BY CASE WHEN azure_oid = @oid THEN 0 ELSE 1 END`;
      } else {
        userQuery += ` WHERE azure_oid = @oid`;
      }
    } else if (actorEmail) {
      userRequest.input('email', sql.NVarChar, actorEmail);
      userQuery += ` WHERE LOWER(Email) = @email`;
    } else {
      return res.status(400).json({ message: 'Cannot resolve user identity.' });
    }

    const userResult = await userRequest.query(userQuery);
    if (!userResult.recordset.length) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Use x-xen-customer-id override if present (Super Admin enterprise switching)
    const overrideCustomerId = req.headers['x-xen-customer-id'] as string | undefined;
    const customerId = overrideCustomerId
      ? parseInt(overrideCustomerId, 10)
      : userResult.recordset[0].customer_id;

    if (!customerId) {
      return res.status(400).json({ message: 'User has no customer context.' });
    }

    const userId = userResult.recordset[0]?.userID ?? null;
    const isSuperAdmin = userResult.recordset[0]?.Role === 'Super Admin';

    // Check if user has group assignments for scoping
    let groupIds: number[] | null = null;
    if (!isSuperAdmin && userId) {
      const grpAssign = await pool.request()
        .input('uid', sql.Int, userId)
        .query(`SELECT group_id FROM dbo.UserGroupAssignment WHERE user_id = @uid`)
        .catch(() => ({ recordset: [] as any[] }));
      if (grpAssign.recordset.length > 0) {
        groupIds = grpAssign.recordset.map((r: any) => r.group_id);
      }
    }

    const req2 = pool.request().input('customerId', sql.Int, customerId);
    let groupScopeClause = '';
    if (groupIds) {
      groupScopeClause = `AND pg.id IN (${groupIds.join(',')})`;
    }

    // Fetch groups -> locations using GroupLocation (which has the correct city names),
    // filtered to only locations that have actual claim data in recon_report for this customer.
    const allData = await req2.query(`
      SELECT
        pg.id   AS group_id,   pg.name   AS group_name,
        gl.id   AS loc_id,     gl.location_name
      FROM dbo.PracticeGroup pg
      JOIN dbo.GroupLocation gl ON gl.group_id = pg.id
      WHERE pg.customer_id = @customerId AND ISNULL(pg.is_active, 1) = 1
        ${groupScopeClause}
        AND EXISTS (
          SELECT 1 FROM dbo.recon_report rr
          JOIN dbo.claims c ON c.ClaimID = rr.ClaimID AND c.customer_id = @customerId
          WHERE rr.Location = gl.location_name
        )
      ORDER BY pg.name, gl.location_name
    `);

    const grpMap = new Map<number, any>();
    for (const row of allData.recordset) {
      if (!grpMap.has(row.group_id)) {
        grpMap.set(row.group_id, { id: row.group_id, name: row.group_name, locations: [] });
      }
      grpMap.get(row.group_id)!.locations.push({ id: row.loc_id, name: row.location_name });
    }

    return res.json({ data: Array.from(grpMap.values()) });
  } catch (err) {
    logger.error(`GET /api/groups error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
