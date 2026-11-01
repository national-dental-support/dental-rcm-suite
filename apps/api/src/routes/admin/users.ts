import { Router } from 'express';
import sql from 'mssql';
import { requireRole } from '../../middleware/require-role';
import Database from '../../modules/db';
import logger from '../../utils/logger';
import { writeAuditLog } from '../../utils/audit-log';
import { trackEvent } from '../../utils/telemetry';

const router = Router();
const pool = Database.getInstance().getPool();

const VALID_ROLES = ['Super Admin', 'Admin', 'Training Admin', 'Manager', 'AR Specialist', 'User'];

const ROLE_HIERARCHY: Record<string, number> = {
  'User': 0,
  'AR Specialist': 1,
  'Manager': 2,
  'Training Admin': 3,
  'Admin': 4,
  'Super Admin': 5,
};

/**
 * Verify the target user belongs to the actor's tenant.
 * Super Admins bypass this check (they can manage any tenant).
 */
async function verifyTenantAccess(userId: number, actor: any): Promise<boolean> {
  if (actor.role === 'Super Admin') return true;
  if (!actor.customer_id) return false;
  const check = await pool.request()
    .input('id', sql.Int, userId)
    .input('customerId', sql.Int, actor.customer_id)
    .query(`SELECT 1 FROM dbo.Users WHERE userID = @id AND customer_id = @customerId`);
  return check.recordset.length > 0;
}

/**
 * GET /api/admin/users/managers
 * Returns all active Manager-role users for the current tenant.
 * Used by the add/edit user form to populate the "Reports To" dropdown.
 * MUST be declared before /:id routes so Express doesn't match "managers" as an :id.
 */
router.get('/managers', requireRole('Admin'), async (req, res) => {
  try {
    const actor = (req as any).actor;
    const isSuperAdmin = actor?.role === 'Super Admin';
    const xenCustId = req.headers['x-xen-customer-id'] ? parseInt(req.headers['x-xen-customer-id'] as string) : null;
    const customerId = (isSuperAdmin && xenCustId) ? xenCustId : actor?.customer_id;
    const shouldFilterTenant = (!isSuperAdmin && customerId) || (isSuperAdmin && xenCustId);

    const request = pool.request();
    let where = `WHERE Role = 'Manager' AND ISNULL(archived, 0) = 0 AND ISNULL(disabled, 0) = 0`;
    if (shouldFilterTenant) {
      where += ` AND customer_id = @customerId`;
      request.input('customerId', sql.Int, customerId);
    }

    const result = await request.query(`
      SELECT
        userID AS id,
        ISNULL(FirstName, '') + ' ' + ISNULL(LastName, '') AS name
      FROM dbo.Users
      ${where}
      ORDER BY FirstName, LastName
    `);

    return res.status(200).json({ data: result.recordset });
  } catch (err: any) {
    logger.error(`GET /api/admin/users/managers error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/users
 * Returns users for the admin list.
 * ?status=active (default) | archived | all
 */
router.get('/', requireRole('Admin'), async (req, res) => {
  try {
    const status = (req.query.status as string || 'active').toLowerCase();

    const actor = (req as any).actor;
    const isSuperAdmin = actor?.role === 'Super Admin';
    // Super Admin can scope to a specific tenant via x-xen-customer-id header
    const xenCustId = req.headers['x-xen-customer-id'] ? parseInt(req.headers['x-xen-customer-id'] as string) : null;
    const customerId = (isSuperAdmin && xenCustId) ? xenCustId : actor?.customer_id;
    const shouldFilterTenant = (!isSuperAdmin && customerId) || (isSuperAdmin && xenCustId);

    const conditions: string[] = [];
    if (status === 'archived') {
      conditions.push('ISNULL(archived, 0) = 1');
    } else if (status !== 'all') {
      conditions.push('ISNULL(archived, 0) = 0');
    }
    // Tenant isolation
    if (shouldFilterTenant) {
      conditions.push('customer_id = @customerId');
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const request = pool.request();
    if (shouldFilterTenant) {
      request.input('customerId', sql.Int, customerId);
    }

    const result = await request.query(`
      SELECT
        CAST(userID AS NVARCHAR(20))                                          AS id,
        ISNULL(FirstName, '') + ' ' + ISNULL(LastName, '')                    AS name,
        Email                                                                 AS email,
        ISNULL(Role, 'User')                                                  AS role,
        CASE WHEN ISNULL(disabled, 0) = 1 THEN CAST(0 AS BIT)
             ELSE CAST(1 AS BIT) END                                          AS active,
        CAST(ISNULL(archived, 0) AS BIT)                                      AS archived,
        CONVERT(NVARCHAR(30), last_login_at, 126)                             AS lastLoginAt,
        CONVERT(NVARCHAR(30), created_at, 126)                               AS createdAt,
        ISNULL(failed_login_count, 0)                                         AS failedLoginCount,
        CONVERT(NVARCHAR(30), locked_until, 126)                              AS lockedUntil
      FROM Users
      ${whereClause}
      ORDER BY FirstName, LastName
    `);

    return res.status(200).json(result.recordset);
  } catch (err: any) {
    logger.error(`GET /api/admin/users error: ${err}`);
    return res.status(500).json({ message: 'Internal server error', detail: err?.message });
  }
});

/**
 * POST /api/admin/users
 * Creates a new portal user.
 * Inherits customer_id from the creating admin's tenant.
 */
router.post('/', requireRole('Admin'), async (req, res) => {
  const { firstName, lastName, email, role, permissions } = req.body;
  const actor = (req as any).actor ?? { email: 'unknown', role: 'unknown', customer_id: null };
  const isSuperAdmin = actor.role === 'Super Admin';
  const xenCustId = req.headers['x-xen-customer-id'] ? parseInt(req.headers['x-xen-customer-id'] as string) : null;
  const effectiveCustomerId = (isSuperAdmin && xenCustId) ? xenCustId : actor.customer_id;

  const fn = (firstName ?? '').trim();
  const ln = (lastName ?? '').trim();
  const em = (email ?? '').trim();

  if (!em) return res.status(400).json({ message: 'email is required.' });
  if (!fn && !ln) return res.status(400).json({ message: 'First or last name is required.' });

  const normalizedRole = VALID_ROLES.includes(role) ? role : 'User';

  // Prevent creating users with a role higher than the actor's own role
  const actorLevel = ROLE_HIERARCHY[actor.role] ?? 0;
  const targetLevel = ROLE_HIERARCHY[normalizedRole] ?? 0;
  if (targetLevel > actorLevel) {
    return res.status(403).json({ message: `Cannot assign role "${normalizedRole}" \u2014 exceeds your own role level.` });
  }

  try {
    const dup = await pool.request()
      .input('email', sql.NVarChar, em.toLowerCase())
      .query(`SELECT userID, archived FROM dbo.Users WHERE LOWER(Email) = @email`);

    if (dup.recordset.length > 0) {
      const existing = dup.recordset[0];
      if (existing.archived) {
        // User was archived - restore them instead of creating a duplicate
        await pool.request()
          .input('id', sql.Int, existing.userID)
          .input('firstName', sql.NVarChar, fn)
          .input('lastName', sql.NVarChar, ln)
          .input('role', sql.NVarChar, normalizedRole)
          .input('permissions', sql.NVarChar(sql.MAX), JSON.stringify(permissions ?? {}))
          .input('customerId', sql.Int, effectiveCustomerId ?? null)
          .query(`
            UPDATE dbo.Users
            SET FirstName = @firstName, LastName = @lastName, Role = @role,
                permissions = @permissions, customer_id = @customerId,
                disabled = 0, archived = 0
            WHERE userID = @id
          `);
        writeAuditLog(pool, {
          actor_id: actor.email, actor_role: actor.role,
          action: 'user.restore', target_id: em,
          before_state: { archived: true },
          after_state: { firstName: fn, lastName: ln, email: em, role: normalizedRole, archived: false, customer_id: effectiveCustomerId },
          ip_address: req.ip,
        });
        return res.status(200).json({ message: 'Archived user restored.', id: existing.userID });
      }
      return res.status(409).json({ message: `A user with email "${em}" already exists.` });
    }

    // userID is not an identity column - generate next ID manually
    const maxIdResult = await pool.request()
      .query(`SELECT ISNULL(MAX(userID), 0) + 1 AS nextId FROM dbo.Users`);
    const nextId: number = maxIdResult.recordset[0].nextId;

    const insertResult = await pool.request()
      .input('userId',      sql.Int,                nextId)
      .input('firstName',   sql.NVarChar,           fn)
      .input('lastName',    sql.NVarChar,           ln)
      .input('email',       sql.NVarChar,           em)
      .input('role',        sql.NVarChar,           normalizedRole)
      .input('permissions', sql.NVarChar(sql.MAX),  JSON.stringify(permissions ?? {}))
      .input('customerId',  sql.Int,                effectiveCustomerId ?? null)
      .query(`
        INSERT INTO dbo.Users (userID, FirstName, LastName, Email, Role, disabled, archived, permissions, customer_id, created_at)
        OUTPUT INSERTED.userID
        VALUES (@userId, @firstName, @lastName, @email, @role, 0, 0, @permissions, @customerId, GETUTCDATE())
      `);

    const newUserId: number | null = insertResult.recordset[0]?.userID ?? null;

    writeAuditLog(pool, {
      actor_id:    actor.email,
      actor_role:  actor.role,
      action:      'user.create',
      target_id:   em,
      before_state: null,
      after_state: { firstName: fn, lastName: ln, email: em, role: normalizedRole, customer_id: effectiveCustomerId },
      ip_address:  req.ip,
    });

    trackEvent(pool, { event: 'user_created', feature: 'admin', actorId: null, customerId: effectiveCustomerId ?? null, metadata: { newUserId, email: em, role: normalizedRole } });
    return res.status(201).json({ message: 'User created.', id: newUserId });
  } catch (err) {
    logger.error(`POST /api/admin/users error: ${err}`);
    return res.status(500).json({ message: 'Error creating user' });
  }
});

/**
 * PUT /api/admin/users/:id
 * Updates an existing portal user's name, email, and role.
 * Enforces: tenant isolation, role escalation ceiling, no self-role-change.
 */
router.put('/:id', requireRole('Admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const { firstName, lastName, email, role, permissions, manager_id } = req.body;
  const actor = (req as any).actor ?? { email: 'unknown', role: 'unknown', customer_id: null };
  const normalizedRole = VALID_ROLES.includes(role) ? role : 'User';

  // Tenant isolation: verify target belongs to actor's tenant
  if (!(await verifyTenantAccess(id, actor))) {
    return res.status(403).json({ message: 'Forbidden: user does not belong to your organization.' });
  }

  // Prevent role escalation beyond actor's own level
  const actorLevel = ROLE_HIERARCHY[actor.role] ?? 0;
  const targetLevel = ROLE_HIERARCHY[normalizedRole] ?? 0;
  if (targetLevel > actorLevel) {
    return res.status(403).json({ message: `Cannot assign role "${normalizedRole}" \u2014 exceeds your own role level.` });
  }

  try {
    const before = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 FirstName, LastName, Email, Role, permissions FROM dbo.Users WHERE userID = @id`);

    if (!before.recordset.length) return res.status(404).json({ message: 'User not found.' });

    const existingUser = before.recordset[0];

    // Prevent actors from changing their own role (separation of duties)
    if (actor.email.toLowerCase() === (existingUser.Email ?? '').toLowerCase() && existingUser.Role !== normalizedRole) {
      return res.status(403).json({ message: 'You cannot change your own role. Ask another administrator.' });
    }

    const updateReq = pool.request()
      .input('id',          sql.Int,            id)
      .input('firstName',   sql.NVarChar,       (firstName ?? '').trim())
      .input('lastName',    sql.NVarChar,       (lastName  ?? '').trim())
      .input('email',       sql.NVarChar,       (email     ?? '').trim())
      .input('role',        sql.NVarChar,       normalizedRole)
      .input('permissions', sql.NVarChar(sql.MAX), JSON.stringify(permissions ?? {}));

    let managerSetClause = '';
    if (manager_id !== undefined) {
      updateReq.input('managerId', sql.Int, manager_id === null ? null : Number(manager_id));
      managerSetClause = ', manager_id = @managerId';
    }

    await updateReq.query(`
      UPDATE dbo.Users
      SET FirstName = @firstName, LastName = @lastName, Email = @email, Role = @role,
          permissions = @permissions${managerSetClause}
      WHERE userID = @id
    `);

    // If manager_id changed, update ManagerSpecialistAssignment table
    if (manager_id !== undefined) {
      // Remove old assignment
      await pool.request()
        .input('specialistId', sql.Int, id)
        .query(`DELETE FROM dbo.ManagerSpecialistAssignment WHERE specialist_id = @specialistId`);

      // Insert new assignment if manager_id is not null
      if (manager_id !== null) {
        await pool.request()
          .input('managerId', sql.Int, Number(manager_id))
          .input('specialistId', sql.Int, id)
          .query(`
            INSERT INTO dbo.ManagerSpecialistAssignment (manager_id, specialist_id)
            VALUES (@managerId, @specialistId)
          `);
      }
    }

    writeAuditLog(pool, {
      actor_id:    actor.email,
      actor_role:  actor.role,
      action:      'user.update',
      target_id:   (email ?? '').trim(),
      before_state: { FirstName: existingUser.FirstName, LastName: existingUser.LastName, Email: existingUser.Email, Role: existingUser.Role },
      after_state: { firstName: (firstName ?? '').trim(), lastName: (lastName ?? '').trim(), email: (email ?? '').trim(), role: normalizedRole, manager_id: manager_id ?? null },
      ip_address:  req.ip,
    });

    trackEvent(pool, { event: 'user_updated', feature: 'admin', actorId: null, customerId: actor.customer_id ?? null, metadata: { userId: id, email: (email ?? '').trim(), role: normalizedRole } });
    return res.json({ message: 'User updated.' });
  } catch (err) {
    logger.error(`PUT /api/admin/users/:id error: ${err}`);
    return res.status(500).json({ message: 'Error updating user' });
  }
});

/**
 * GET /api/admin/users/:id
 * Returns a single user's editable fields for the edit-user form.
 * Enforces tenant isolation.
 */
router.get('/:id', requireRole('Admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const actor = (req as any).actor;

  // Tenant isolation
  if (!(await verifyTenantAccess(id, actor))) {
    return res.status(403).json({ message: 'Forbidden: user does not belong to your organization.' });
  }

  try {
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 1
          ISNULL(FirstName, '') AS firstName,
          ISNULL(LastName, '')  AS lastName,
          Email                 AS email,
          ISNULL(Role, 'User')  AS role,
          ISNULL(permissions, '{}') AS permissionsJson
        FROM dbo.Users
        WHERE userID = @id
      `);

    if (!result.recordset.length) return res.status(404).json({ message: 'User not found.' });
    const { permissionsJson, ...rest } = result.recordset[0] as any;
    let permissions: Record<string, boolean> = {};
    try { permissions = JSON.parse(permissionsJson || '{}'); } catch { /* ignore */ }
    return res.json({ ...rest, permissions });
  } catch (err) {
    logger.error(`GET /api/admin/users/:id error: ${err}`);
    return res.status(500).json({ message: 'Error fetching user' });
  }
});

/**
 * GET /api/admin/users/:id/products
 * Returns all products with an `assigned` flag for the given user.
 * Enforces tenant isolation.
 */
router.get('/:id/products', requireRole('Admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const actor = (req as any).actor;
  if (!(await verifyTenantAccess(id, actor))) {
    return res.status(403).json({ message: 'Forbidden: user does not belong to your organization.' });
  }

  try {
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT p.id, p.slug, p.name, CAST(ISNULL(up.is_active, 0) AS BIT) AS assigned
        FROM dbo.Products p
        LEFT JOIN dbo.UserProducts up ON up.product_id = p.id AND up.user_id = @id
        WHERE p.is_active = 1 AND p.slug != 'superadmin'
        ORDER BY p.nav_order
      `);
    return res.json(result.recordset);
  } catch (err) {
    logger.error(`GET /api/admin/users/:id/products error: ${err}`);
    return res.status(500).json({ message: 'Error fetching user products' });
  }
});

/**
 * PUT /api/admin/users/:id/products
 * Sets product assignments for a user. Body: { productIds: number[] }
 * Enforces tenant isolation.
 */
router.put('/:id/products', requireRole('Admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const { productIds } = req.body;
  if (!Array.isArray(productIds)) return res.status(400).json({ message: 'productIds must be an array.' });

  const actor = (req as any).actor ?? { email: 'unknown', role: 'unknown' };

  if (!(await verifyTenantAccess(id, actor))) {
    return res.status(403).json({ message: 'Forbidden: user does not belong to your organization.' });
  }

  try {
    // Capture before state for audit
    const beforeProducts = await pool.request()
      .input('userId', sql.Int, id)
      .query(`SELECT product_id FROM dbo.UserProducts WHERE user_id = @userId AND is_active = 1`);
    const beforeIds = beforeProducts.recordset.map((r: any) => r.product_id);

    const allProducts = await pool.request().query(`
      SELECT id FROM dbo.Products WHERE is_active = 1 AND slug != 'superadmin'
    `);

    for (const row of allProducts.recordset) {
      const pid: number = row.id;
      const isActive = productIds.includes(pid) ? 1 : 0;
      await pool.request()
        .input('userId', sql.Int, id)
        .input('productId', sql.Int, pid)
        .input('isActive', sql.Bit, isActive)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.UserProducts WHERE user_id = @userId AND product_id = @productId)
            UPDATE dbo.UserProducts SET is_active = @isActive WHERE user_id = @userId AND product_id = @productId
          ELSE
            INSERT INTO dbo.UserProducts (user_id, product_id, is_active, assigned_by)
            VALUES (@userId, @productId, @isActive, 'admin')
        `);
    }

    writeAuditLog(pool, {
      actor_id:    actor.email,
      actor_role:  actor.role,
      action:      'user.products.update',
      target_id:   String(id),
      before_state: { productIds: beforeIds },
      after_state: { productIds },
      ip_address:  req.ip,
    });

    return res.json({ message: 'Products updated.' });
  } catch (err) {
    logger.error(`PUT /api/admin/users/:id/products error: ${err}`);
    return res.status(500).json({ message: 'Error updating user products' });
  }
});

/**
 * GET /api/admin/users/:id/scope
 * Returns the user's queue scope (locations, providers, payers they can see).
 * Empty arrays = unrestricted for that type.
 * Enforces tenant isolation.
 */
router.get('/:id/scope', requireRole('Admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const actor = (req as any).actor;
  if (!(await verifyTenantAccess(id, actor))) {
    return res.status(403).json({ message: 'Forbidden: user does not belong to your organization.' });
  }

  try {
    const result = await pool.request()
      .input('userId', sql.Int, id)
      .query(`SELECT scope_type, scope_value FROM dbo.UserQueueScope WHERE user_id = @userId`);

    const locations: string[] = [];
    const providers: string[] = [];
    const payers: string[] = [];

    for (const row of result.recordset) {
      switch (row.scope_type) {
        case 'location': locations.push(row.scope_value); break;
        case 'provider': providers.push(row.scope_value); break;
        case 'payer':    payers.push(row.scope_value);    break;
      }
    }

    return res.json({ locations, providers, payers });
  } catch (err) {
    logger.error(`GET /api/admin/users/:id/scope error: ${err}`);
    return res.status(500).json({ message: 'Error fetching scope' });
  }
});

/**
 * PUT /api/admin/users/:id/scope
 * Replaces the user's queue scope. Body: { locations: string[], providers: string[], payers: string[] }
 * Empty array = unrestricted for that type.
 * Enforces tenant isolation. Captures before_state for audit trail.
 */
router.put('/:id/scope', requireRole('Admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const { locations = [], providers = [], payers = [] } = req.body;
  const actor = (req as any).actor ?? { email: 'unknown', role: 'unknown' };

  if (!(await verifyTenantAccess(id, actor))) {
    return res.status(403).json({ message: 'Forbidden: user does not belong to your organization.' });
  }

  try {
    // Capture before_state for audit trail
    const existingScope = await pool.request()
      .input('userId', sql.Int, id)
      .query(`SELECT scope_type, scope_value FROM dbo.UserQueueScope WHERE user_id = @userId`);

    const beforeLocations: string[] = [];
    const beforeProviders: string[] = [];
    const beforePayers: string[] = [];
    for (const row of existingScope.recordset) {
      switch (row.scope_type) {
        case 'location': beforeLocations.push(row.scope_value); break;
        case 'provider': beforeProviders.push(row.scope_value); break;
        case 'payer':    beforePayers.push(row.scope_value);    break;
      }
    }

    // Delete existing scope for this user
    await pool.request()
      .input('userId', sql.Int, id)
      .query(`DELETE FROM dbo.UserQueueScope WHERE user_id = @userId`);

    // Insert new scope rows
    const rows: Array<{ type: string; value: string }> = [
      ...locations.map((v: string) => ({ type: 'location', value: v })),
      ...providers.map((v: string) => ({ type: 'provider', value: v })),
      ...payers.map((v: string) => ({ type: 'payer', value: v })),
    ];

    for (const row of rows) {
      await pool.request()
        .input('userId', sql.Int, id)
        .input('scopeType', sql.VarChar(20), row.type)
        .input('scopeValue', sql.NVarChar(255), row.value)
        .query(`
          INSERT INTO dbo.UserQueueScope (user_id, scope_type, scope_value)
          VALUES (@userId, @scopeType, @scopeValue)
        `);
    }

    writeAuditLog(pool, {
      actor_id:    actor.email,
      actor_role:  actor.role,
      action:      'user.scope.update',
      target_id:   String(id),
      before_state: { locations: beforeLocations, providers: beforeProviders, payers: beforePayers },
      after_state: { locations, providers, payers },
      ip_address:  req.ip,
    });

    return res.json({ message: 'Scope updated.' });
  } catch (err) {
    logger.error(`PUT /api/admin/users/:id/scope error: ${err}`);
    return res.status(500).json({ message: 'Error updating scope' });
  }
});

/**
 * PATCH /api/admin/users/:id/archive
 * Soft-deletes a user (sets archived=1, disabled=1).
 * Enforces tenant isolation. Full audit trail with before/after state.
 */
router.patch('/:id/archive', requireRole('Admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const actor = (req as any).actor ?? { email: 'unknown', role: 'unknown' };

  if (!(await verifyTenantAccess(id, actor))) {
    return res.status(403).json({ message: 'Forbidden: user does not belong to your organization.' });
  }

  try {
    const before = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 FirstName, LastName, Email, Role, disabled, archived FROM dbo.Users WHERE userID = @id`);

    if (!before.recordset.length) return res.status(404).json({ message: 'User not found.' });

    const user = before.recordset[0];

    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE dbo.Users SET archived = 1, disabled = 1 WHERE userID = @id`);

    writeAuditLog(pool, {
      actor_id: actor.email, actor_role: actor.role,
      action: 'user.archive', target_id: user.Email,
      before_state: user,
      after_state: { FirstName: user.FirstName, LastName: user.LastName, Email: user.Email, Role: user.Role, archived: 1, disabled: 1 },
      ip_address: req.ip,
    });

    trackEvent(pool, { event: 'user_disabled', feature: 'admin', actorId: null, customerId: actor.customer_id ?? null, metadata: { userId: id, email: user.Email } });
    return res.json({ message: 'User archived.' });
  } catch (err) {
    logger.error(`PATCH /api/admin/users/:id/archive error: ${err}`);
    return res.status(500).json({ message: 'Error archiving user' });
  }
});

/**
 * PATCH /api/admin/users/:id/toggle-status
 * Toggles the disabled flag for a non-archived user.
 * Pass { enable: true } to enable, { enable: false } to disable.
 * Does NOT affect archived users.
 */
router.patch('/:id/toggle-status', requireRole('Admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const actor = (req as any).actor ?? { email: 'unknown', role: 'unknown' };
  if (!await verifyTenantAccess(id, actor)) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    const userResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 FirstName, LastName, Email, Role, disabled, archived FROM dbo.Users WHERE userID = @id`);
    if (!userResult.recordset.length) return res.status(404).json({ message: 'User not found.' });

    const user = userResult.recordset[0];
    if (user.archived) return res.status(400).json({ message: 'Cannot toggle status of an archived user. Restore them first.' });

    // Determine new disabled value from request body or toggle current
    const enable = typeof req.body?.enable === 'boolean' ? req.body.enable : (user.disabled === 1 || user.disabled === true);
    const newDisabled = enable ? 0 : 1;

    await pool.request()
      .input('id', sql.Int, id)
      .input('disabled', sql.Bit, newDisabled)
      .query(`UPDATE dbo.Users SET disabled = @disabled WHERE userID = @id`);

    return res.json({ message: enable ? 'User enabled.' : 'User disabled.', active: enable });
  } catch (err: any) {
    logger.error(`PATCH /api/admin/users/:id/toggle-status error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * PATCH /api/admin/users/:id/unlock
 * Resets failed_login_count and locked_until for a locked-out user.
 * Enforces tenant isolation.
 */
router.patch('/:id/unlock', requireRole('Admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const actor = (req as any).actor ?? { email: 'unknown', role: 'unknown' };

  if (!(await verifyTenantAccess(id, actor))) {
    return res.status(403).json({ message: 'Forbidden: user does not belong to your organization.' });
  }

  try {
    const before = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 Email, failed_login_count, locked_until FROM dbo.Users WHERE userID = @id`);

    if (!before.recordset.length) return res.status(404).json({ message: 'User not found.' });

    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE dbo.Users SET failed_login_count = 0, locked_until = NULL WHERE userID = @id`);

    writeAuditLog(pool, {
      actor_id: actor.email, actor_role: actor.role,
      action: 'user.unlock', target_id: before.recordset[0].Email,
      before_state: { failed_login_count: before.recordset[0].failed_login_count, locked_until: before.recordset[0].locked_until },
      after_state: { failed_login_count: 0, locked_until: null },
      ip_address: req.ip,
    });

    return res.json({ message: 'Account unlocked.' });
  } catch (err) {
    logger.error(`PATCH /api/admin/users/:id/unlock error: ${err}`);
    return res.status(500).json({ message: 'Error unlocking user' });
  }
});

/**
 * PATCH /api/admin/users/:id/restore
 * Restores an archived user (sets archived=0, disabled=0).
 * Enforces tenant isolation. Full audit trail.
 */
router.patch('/:id/restore', requireRole('Admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const actor = (req as any).actor ?? { email: 'unknown', role: 'unknown' };

  if (!(await verifyTenantAccess(id, actor))) {
    return res.status(403).json({ message: 'Forbidden: user does not belong to your organization.' });
  }

  try {
    const before = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 FirstName, LastName, Email, Role, disabled, archived FROM dbo.Users WHERE userID = @id`);

    if (!before.recordset.length) return res.status(404).json({ message: 'User not found.' });

    const user = before.recordset[0];

    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE dbo.Users SET archived = 0, disabled = 0 WHERE userID = @id`);

    writeAuditLog(pool, {
      actor_id: actor.email, actor_role: actor.role,
      action: 'user.restore', target_id: user.Email,
      before_state: user,
      after_state: { FirstName: user.FirstName, LastName: user.LastName, Email: user.Email, Role: user.Role, archived: 0, disabled: 0 },
      ip_address: req.ip,
    });

    return res.json({ message: 'User restored.' });
  } catch (err) {
    logger.error(`PATCH /api/admin/users/:id/restore error: ${err}`);
    return res.status(500).json({ message: 'Error restoring user' });
  }
});

/**
 * GET /api/admin/users/:id/manager
 * Returns the specialist's assigned manager.
 * Enforces tenant isolation.
 */
router.get('/:id/manager', requireRole('Admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const actor = (req as any).actor;
  if (!(await verifyTenantAccess(id, actor))) {
    return res.status(403).json({ message: 'Forbidden: user does not belong to your organization.' });
  }

  try {
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT m.userID AS id, m.FirstName AS firstName, m.LastName AS lastName, m.Email AS email
        FROM dbo.Users u
        JOIN dbo.Users m ON u.manager_id = m.userID
        WHERE u.userID = @id
      `);

    if (!result.recordset.length) {
      return res.json({ manager: null });
    }
    return res.json({ manager: result.recordset[0] });
  } catch (err) {
    logger.error(`GET /api/admin/users/:id/manager error: ${err}`);
    return res.status(500).json({ message: 'Error fetching manager' });
  }
});

/**
 * PUT /api/admin/users/:id/manager
 * Assign a specialist to a manager (or remove manager assignment).
 * Body: { manager_id: number | null }
 * Enforces tenant isolation.
 */
router.put('/:id/manager', requireRole('Admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const { manager_id } = req.body;
  const actor = (req as any).actor ?? { email: 'unknown', role: 'unknown', customer_id: null };

  if (!(await verifyTenantAccess(id, actor))) {
    return res.status(403).json({ message: 'Forbidden: user does not belong to your organization.' });
  }

  try {
    // Capture before state
    const before = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 manager_id FROM dbo.Users WHERE userID = @id`);
    if (!before.recordset.length) return res.status(404).json({ message: 'User not found.' });

    const oldManagerId = before.recordset[0].manager_id;

    // Update manager_id on the user record
    await pool.request()
      .input('id', sql.Int, id)
      .input('managerId', sql.Int, manager_id === null || manager_id === undefined ? null : Number(manager_id))
      .query(`UPDATE dbo.Users SET manager_id = @managerId WHERE userID = @id`);

    // Update ManagerSpecialistAssignment - MERGE for atomic upsert
    if (manager_id !== null && manager_id !== undefined) {
      await pool.request()
        .input('managerId', sql.Int, Number(manager_id))
        .input('specialistId', sql.Int, id)
        .query(`
          MERGE dbo.ManagerSpecialistAssignment AS target
          USING (SELECT @specialistId AS specialist_id) AS source
          ON target.specialist_id = source.specialist_id
          WHEN MATCHED THEN UPDATE SET manager_id = @managerId
          WHEN NOT MATCHED THEN INSERT (manager_id, specialist_id) VALUES (@managerId, @specialistId);
        `);
    } else {
      await pool.request()
        .input('specialistId', sql.Int, id)
        .query(`DELETE FROM dbo.ManagerSpecialistAssignment WHERE specialist_id = @specialistId`);
    }

    writeAuditLog(pool, {
      actor_id: actor.email,
      actor_role: actor.role,
      action: 'user.manager.update',
      target_id: String(id),
      before_state: { manager_id: oldManagerId },
      after_state: { manager_id: manager_id ?? null },
      ip_address: req.ip,
    });

    return res.json({ message: 'Manager assignment updated.' });
  } catch (err) {
    logger.error(`PUT /api/admin/users/:id/manager error: ${err}`);
    return res.status(500).json({ message: 'Error updating manager assignment' });
  }
});

/**
 * GET /api/admin/users/:id/team
 * Returns the manager's direct reports (specialists assigned to this manager).
 * Enforces tenant isolation.
 */
router.get('/:id/team', requireRole('Manager'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id.' });

  const actor = (req as any).actor;
  if (!(await verifyTenantAccess(id, actor))) {
    return res.status(403).json({ message: 'Forbidden: user does not belong to your organization.' });
  }

  try {
    const result = await pool.request()
      .input('managerId', sql.Int, id)
      .query(`
        SELECT
          u.userID AS id,
          u.FirstName AS firstName,
          u.LastName AS lastName,
          u.Email AS email,
          u.Role AS role
        FROM dbo.ManagerSpecialistAssignment msa
        JOIN dbo.Users u ON u.userID = msa.specialist_id
        WHERE msa.manager_id = @managerId
          AND ISNULL(u.disabled, 0) = 0 AND ISNULL(u.archived, 0) = 0
        ORDER BY u.FirstName, u.LastName
      `);

    return res.json({ data: result.recordset });
  } catch (err) {
    logger.error(`GET /api/admin/users/:id/team error: ${err}`);
    return res.status(500).json({ message: 'Error fetching team members' });
  }
});

// -- Admin -> Manager Assignments (CRUD) --------------------------------------

/** GET /api/admin/users/:id/managed-managers - list managers assigned to this admin */
router.get('/:id/managed-managers', requireRole('Admin'), async (req, res) => {
  try {
    const adminId = parseInt(req.params.id, 10);
    const customerId = (req as any).actor?.customer_id;
    const isSuperAdmin = (req as any).actor?.role === 'Super Admin';
    const dbReq = pool.request().input('adminId', sql.Int, adminId);
    const cFilter = (!isSuperAdmin && customerId) ? ` AND ama.customer_id = @custId` : '';
    if (!isSuperAdmin && customerId) dbReq.input('custId', sql.Int, customerId);
    const result = await dbReq.query(`
        SELECT ama.id AS assignmentId, ama.manager_id AS managerId,
               u.FirstName + ' ' + u.LastName AS managerName, u.Email AS managerEmail,
               ama.created_at AS assignedAt,
               (SELECT COUNT(*) FROM dbo.ManagerSpecialistAssignment msa WHERE msa.manager_id = ama.manager_id) AS specialistCount
        FROM dbo.AdminManagerAssignment ama
        JOIN dbo.Users u ON u.userID = ama.manager_id
        WHERE ama.admin_id = @adminId${cFilter}
        ORDER BY u.LastName, u.FirstName
      `);
    res.json({ data: result.recordset });
  } catch (err) {
    logger.error(`GET /managed-managers error: ${err}`);
    res.status(500).json({ message: 'Error fetching managed managers' });
  }
});

/** POST /api/admin/users/:id/managed-managers - assign a manager to this admin */
router.post('/:id/managed-managers', requireRole('Admin'), async (req, res) => {
  try {
    const adminId = parseInt(req.params.id, 10);
    const { managerId } = req.body;
    const customerId = (req as any).actor?.customer_id;
    const actorEmail = (req as any).actor?.email ?? 'unknown';

    if (!managerId || !Number.isInteger(managerId)) {
      return res.status(400).json({ message: 'managerId is required' });
    }

    // Verify the target is actually a Manager
    // Super Admins can assign across tenants; regular Admins are scoped to their customer
    const actorRole = (req as any).actor?.role;
    const isSuperAdmin = actorRole === 'Super Admin';
    const checkReq = pool.request().input('mid', sql.Int, managerId);
    const custFilter = (!isSuperAdmin && customerId) ? ` AND customer_id = @cid` : '';
    if (!isSuperAdmin && customerId) checkReq.input('cid', sql.Int, customerId);
    const check = await checkReq.query(`SELECT Role, customer_id FROM dbo.Users WHERE userID = @mid${custFilter}`);
    if (!check.recordset.length || check.recordset[0].Role !== 'Manager') {
      return res.status(400).json({ message: 'Target user is not a Manager' });
    }

    // Resolve customer_id from the manager (Super Admin may not have one)
    const effectiveCustId = customerId ?? check.recordset[0]?.customer_id ?? (
      await pool.request().input('uid', sql.Int, managerId)
        .query(`SELECT customer_id FROM dbo.Users WHERE userID = @uid`)
    ).recordset[0]?.customer_id;

    await pool.request()
      .input('adminId', sql.Int, adminId).input('managerId', sql.Int, managerId)
      .input('custId', sql.Int, effectiveCustId).input('actor', sql.NVarChar, actorEmail)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.AdminManagerAssignment WHERE admin_id = @adminId AND manager_id = @managerId)
          INSERT INTO dbo.AdminManagerAssignment (admin_id, manager_id, customer_id, created_by)
          VALUES (@adminId, @managerId, @custId, @actor)
      `);

    await writeAuditLog(pool, { actor_id: actorEmail, actor_role: 'Admin', action: 'admin_manager.assign', target_id: String(managerId) });
    res.json({ data: { assigned: true, adminId, managerId } });
  } catch (err) {
    logger.error(`POST /managed-managers error: ${err}`);
    res.status(500).json({ message: 'Error assigning manager' });
  }
});

/** DELETE /api/admin/users/:id/managed-managers/:managerId - unassign a manager from admin */
router.delete('/:id/managed-managers/:managerId', requireRole('Admin'), async (req, res) => {
  try {
    const adminId = parseInt(req.params.id, 10);
    const managerId = parseInt(req.params.managerId, 10);
    const customerId = (req as any).actor?.customer_id;
    const actorEmail = (req as any).actor?.email ?? 'unknown';

    const actorIsSA = (req as any).actor?.role === 'Super Admin';
    const delReq = pool.request().input('adminId', sql.Int, adminId).input('managerId', sql.Int, managerId);
    const delFilter = (!actorIsSA && customerId) ? ` AND customer_id = @custId` : '';
    if (!actorIsSA && customerId) delReq.input('custId', sql.Int, customerId);
    await delReq.query(`DELETE FROM dbo.AdminManagerAssignment WHERE admin_id = @adminId AND manager_id = @managerId${delFilter}`);

    await writeAuditLog(pool, { actor_id: actorEmail, actor_role: 'Admin', action: 'admin_manager.unassign', target_id: String(managerId) });
    res.json({ data: { unassigned: true, adminId, managerId } });
  } catch (err) {
    logger.error(`DELETE /managed-managers error: ${err}`);
    res.status(500).json({ message: 'Error unassigning manager' });
  }
});

/** GET /api/admin/users/:id/full-team - admin's full hierarchy (managers + their specialists) */
router.get('/:id/full-team', requireRole('Admin'), async (req, res) => {
  try {
    const adminId = parseInt(req.params.id, 10);
    const customerId = (req as any).actor?.customer_id;

    // Get managed managers
    const ftIsSA = (req as any).actor?.role === 'Super Admin';
    const ftReq = pool.request().input('adminId', sql.Int, adminId);
    const ftFilter = (!ftIsSA && customerId) ? ` AND ama.customer_id = @custId` : '';
    if (!ftIsSA && customerId) ftReq.input('custId', sql.Int, customerId);
    const managers = await ftReq.query(`
        SELECT u.userID, u.FirstName + ' ' + u.LastName AS name, u.Email, u.Role
        FROM dbo.AdminManagerAssignment ama
        JOIN dbo.Users u ON u.userID = ama.manager_id
        WHERE ama.admin_id = @adminId${ftFilter}
        ORDER BY u.LastName
      `);

    // For each manager, get their specialists
    const team: any[] = [];
    for (const mgr of managers.recordset) {
      const specs = await pool.request().input('mgrId', sql.Int, mgr.userID)
        .query(`
          SELECT u.userID, u.FirstName + ' ' + u.LastName AS name, u.Email, u.Role
          FROM dbo.ManagerSpecialistAssignment msa
          JOIN dbo.Users u ON u.userID = msa.specialist_id
          WHERE msa.manager_id = @mgrId
          ORDER BY u.LastName
        `);
      team.push({ ...mgr, specialists: specs.recordset });
    }

    res.json({ data: team });
  } catch (err) {
    logger.error(`GET /full-team error: ${err}`);
    res.status(500).json({ message: 'Error fetching full team' });
  }
});

export default router;
