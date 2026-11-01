import sql from 'mssql';
import { resolveClientTenantCustomerId } from './tenant-filter';

export interface UserScope {
  userId: number | null;
  customerId: number | null;
  isSuperAdmin: boolean;
  locations: string[];   // empty = unrestricted
  providers: string[];   // empty = unrestricted
  payers: string[];      // empty = unrestricted
  role: string;                    // User's role
  groupIds: number[];              // PracticeGroup IDs (for Admin role)
  groupLocations: string[];        // Location names from user's groups (for Admin)
  teamMemberIds: number[];         // Specialist user IDs (for Manager role)
  teamLocations: string[];         // Locations derived from team members (for Manager)
  managedManagerIds: number[];     // Manager user IDs (for Admin role)
  managedSpecialistIds: number[];  // Transitive: all specialists under admin's managers
  allManagedUserIds: number[];     // Union: admin + managers + specialists (for filtering)
  isManager: boolean;
  isAdmin: boolean;
}

/**
 * Resolve the logged-in user's ID and queue scope from the x-actor-email / x-actor-oid headers.
 * Returns userId + arrays of permitted locations/providers/payers.
 * Empty arrays = no restriction for that scope type.
 */
export async function resolveUserScope(
  pool: sql.ConnectionPool,
  email: string,
  customerIdOverride?: number | null,
  oid?: string | null,
): Promise<UserScope> {
  const empty: UserScope = {
    userId: null, customerId: null, isSuperAdmin: false,
    locations: [], providers: [], payers: [],
    role: '', groupIds: [], groupLocations: [],
    teamMemberIds: [], teamLocations: [],
    managedManagerIds: [], managedSpecialistIds: [], allManagedUserIds: [],
    isManager: false, isAdmin: false,
  };

  if (!email && !oid) return empty;

  // 1. Look up the user's ID, customer_id, and role - OID first, email fallback
  const userReq = pool.request();
  let userQuery = `SELECT TOP 1 userID, customer_id, Role, azure_oid FROM dbo.Users`;

  if (oid) {
    userReq.input('Oid', sql.NVarChar(36), oid);
    if (email) {
      userReq.input('Email', sql.NVarChar(255), email);
      userQuery += ` WHERE azure_oid = @Oid OR Email = @Email ORDER BY CASE WHEN azure_oid = @Oid THEN 0 ELSE 1 END`;
    } else {
      userQuery += ` WHERE azure_oid = @Oid`;
    }
  } else {
    userReq.input('Email', sql.NVarChar(255), email);
    userQuery += ` WHERE Email = @Email`;
  }

  const userResult = await userReq.query(userQuery);
  const userRow = userResult.recordset[0];

  // Auto-link OID on first login if not already stored
  if (userRow && oid && !userRow.azure_oid) {
    pool.request()
      .input('oid', sql.NVarChar(36), oid)
      .input('id', sql.Int, userRow.userID)
      .query(`UPDATE dbo.Users SET azure_oid = @oid WHERE userID = @id AND azure_oid IS NULL`)
      .catch(() => { /* swallow - best effort */ });
  }
  const userId: number | null = userRow?.userID ?? null;
  const customerId: number | null = customerIdOverride ?? userRow?.customer_id ?? null;
  const role: string = userRow?.Role ?? '';
  const isSuperAdmin: boolean = role === 'Super Admin';
  const isManager: boolean = role === 'Manager';
  const isAdmin: boolean = role === 'Admin';

  if (userId == null) return empty;

  // 2. Load their scope assignments
  const scopeReq = pool.request();
  scopeReq.input('UserId', sql.Int, userId);
  const scopeResult = await scopeReq.query(
    `SELECT scope_type, scope_value FROM dbo.UserQueueScope WHERE user_id = @UserId`,
  );

  const locations: string[] = [];
  const providers: string[] = [];
  const payers: string[] = [];

  for (const row of scopeResult.recordset) {
    switch (row.scope_type) {
      case 'location': locations.push(row.scope_value); break;
      case 'provider': providers.push(row.scope_value); break;
      case 'payer':    payers.push(row.scope_value);    break;
    }
  }

  // 3. Manager team scoping - load assigned specialists and their locations
  let teamMemberIds: number[] = [];
  let teamLocations: string[] = [];

  if (isManager) {
    try {
      // Get assigned specialists
      const teamReq = pool.request();
      teamReq.input('ManagerId', sql.Int, userId);
      const teamResult = await teamReq.query(
        `SELECT specialist_id FROM dbo.ManagerSpecialistAssignment WHERE manager_id = @ManagerId`,
      );
      const specialistIds: number[] = teamResult.recordset.map((r: any) => r.specialist_id);

      // Include the manager's own userId - managers can have claims assigned to them too
      teamMemberIds = [userId, ...specialistIds];

      // Get locations from those specialists' queue scope
      if (specialistIds.length > 0) {
        const locReq = pool.request();
        const idParams = specialistIds.map((id, i) => {
          locReq.input(`_tmId${i}`, sql.Int, id);
          return `@_tmId${i}`;
        });
        const locResult = await locReq.query(
          `SELECT DISTINCT scope_value FROM dbo.UserQueueScope
           WHERE user_id IN (${idParams.join(', ')}) AND scope_type = 'location'`,
        );
        teamLocations = locResult.recordset.map((r: any) => r.scope_value);
      }

      // If manager has no explicit UserQueueScope locations, auto-populate from team locations
      if (locations.length === 0 && teamLocations.length > 0) {
        for (const loc of teamLocations) {
          if (!locations.includes(loc)) locations.push(loc);
        }
      }
    } catch {
      // Tables may not exist pre-migration - degrade gracefully
    }
  }

  // 4. Admin group scoping - load practice groups and their locations
  let groupIds: number[] = [];
  let groupLocations: string[] = [];

  if (isAdmin) {
    try {
      // Get groups
      const groupReq = pool.request();
      groupReq.input('AdminUserId', sql.Int, userId);
      const groupResult = await groupReq.query(
        `SELECT group_id FROM dbo.UserGroupAssignment WHERE user_id = @AdminUserId`,
      );
      groupIds = groupResult.recordset.map((r: any) => r.group_id);

      // Get locations from those groups
      if (groupIds.length > 0) {
        const gLocReq = pool.request();
        const gIdParams = groupIds.map((id, i) => {
          gLocReq.input(`_grpId${i}`, sql.Int, id);
          return `@_grpId${i}`;
        });
        const gLocResult = await gLocReq.query(
          `SELECT location_name FROM dbo.GroupLocation WHERE group_id IN (${gIdParams.join(', ')})`,
        );
        groupLocations = gLocResult.recordset.map((r: any) => r.location_name);
      }

      // Merge group locations into the user's location scope (additive, not replacing)
      if (groupLocations.length > 0) {
        for (const loc of groupLocations) {
          if (!locations.includes(loc)) locations.push(loc);
        }
      }
    } catch {
      // Tables may not exist pre-migration - degrade gracefully
    }
  }

  // 5. Admin -> Manager -> Specialist transitive scoping
  let managedManagerIds: number[] = [];
  let managedSpecialistIds: number[] = [];
  let allManagedUserIds: number[] = [];

  if (isAdmin && userId != null) {
    try {
      // Get managers assigned to this admin
      const amReq = pool.request();
      amReq.input('AdminId', sql.Int, userId);
      const amResult = await amReq.query(
        `SELECT manager_id FROM dbo.AdminManagerAssignment WHERE admin_id = @AdminId`,
      );
      managedManagerIds = amResult.recordset.map((r: any) => r.manager_id);

      // Get all specialists under those managers (transitive)
      if (managedManagerIds.length > 0) {
        const msReq = pool.request();
        const mParams = managedManagerIds.map((id, i) => {
          msReq.input(`_amMgr${i}`, sql.Int, id);
          return `@_amMgr${i}`;
        });
        const msResult = await msReq.query(
          `SELECT specialist_id FROM dbo.ManagerSpecialistAssignment WHERE manager_id IN (${mParams.join(', ')})`,
        );
        managedSpecialistIds = msResult.recordset.map((r: any) => r.specialist_id);
      }

      // Build full managed user set: admin + managers + specialists
      allManagedUserIds = [userId, ...managedManagerIds, ...managedSpecialistIds];
    } catch {
      // AdminManagerAssignment table may not exist yet - degrade gracefully
    }
  }

  // Super Admin can override customerId via x-xen-customer-id header (set by require-role).
  // Without an explicit switch, actor.customer_id is cleared to null/0 - resolve CLIENT_TENANT_SLUG.
  // customer_id=0 is never a valid tenant; treat it the same as null (no explicit override).
  let resolvedOverride = customerIdOverride;
  if (isSuperAdmin && (resolvedOverride == null || resolvedOverride === 0)) {
    resolvedOverride = await resolveClientTenantCustomerId(pool);
  }
  // Super Admin with no CLIENT_TENANT_SLUG sees all tenants (no filter); with slug, scoped to that tenant.
  const effectiveCustomerId = isSuperAdmin
    ? (resolvedOverride && resolvedOverride !== 0 ? resolvedOverride : null)
    : customerId;
  const effectiveIsSuperAdmin = isSuperAdmin && !resolvedOverride;

  return {
    userId,
    customerId: effectiveCustomerId,
    isSuperAdmin: effectiveIsSuperAdmin,
    locations,
    providers,
    payers,
    role,
    groupIds,
    groupLocations,
    teamMemberIds,
    teamLocations,
    managedManagerIds,
    managedSpecialistIds,
    allManagedUserIds,
    isManager,
    isAdmin,
  };
}

/**
 * Build a SQL WHERE fragment that restricts claims to the user's permitted
 * locations/providers/payers via recon_report lookups.
 *
 * Returns { sql: string, addInputs: fn } where `sql` is injected into the CTE
 * and `addInputs` binds the parameter values onto the sql.Request.
 *
 * If the user has no restrictions, returns an empty sql string.
 */
export interface ScopeFilter {
  sql: string;                                  // existing WHERE fragments
  addInputs: (request: sql.Request) => void;    // existing input adder
  teamSql: string;                              // team member filter (empty for non-managers)
  addTeamInputs: (request: sql.Request) => void; // adds @_teamId0, etc.
}

export function buildScopeFilter(
  scope: UserScope,
  claimAlias: string,
): ScopeFilter {
  const fragments: string[] = [];
  const inputs: Array<{ name: string; type: (() => sql.ISqlType) | sql.ISqlType; value: string | number }> = [];

  // Tenant isolation: always filter by customer_id.
  // Super Admins default to their own tenant; enterprise switching sets a specific customer_id
  // via x-xen-customer-id which sets isSuperAdmin=false in requireRole middleware.
  if (scope.customerId != null) {
    inputs.push({ name: '_scopeCustId', type: sql.Int, value: scope.customerId });
    fragments.push(`\n      AND ${claimAlias}.customer_id = @_scopeCustId`);
  }

  // Location scope
  if (scope.locations.length > 0) {
    const params = scope.locations.map((v, i) => {
      const name = `_scopeLoc${i}`;
      inputs.push({ name, type: sql.NVarChar(255), value: v });
      return `@${name}`;
    });
    fragments.push(`
      AND EXISTS (
        SELECT 1 FROM dbo.recon_report rr_loc
        WHERE rr_loc.ClaimID = ${claimAlias}.ClaimID
          AND rr_loc.Location IN (${params.join(', ')})
      )`);
  }

  // Provider scope
  if (scope.providers.length > 0) {
    const params = scope.providers.map((v, i) => {
      const name = `_scopeProv${i}`;
      inputs.push({ name, type: sql.NVarChar(255), value: v });
      return `@${name}`;
    });
    fragments.push(`
      AND EXISTS (
        SELECT 1 FROM dbo.recon_report rr_prov
        WHERE rr_prov.ClaimID = ${claimAlias}.ClaimID
          AND rr_prov.ProviderName IN (${params.join(', ')})
      )`);
  }

  // Payer scope
  if (scope.payers.length > 0) {
    const params = scope.payers.map((v, i) => {
      const name = `_scopePay${i}`;
      inputs.push({ name, type: sql.NVarChar(255), value: v });
      return `@${name}`;
    });
    fragments.push(`
      AND EXISTS (
        SELECT 1 FROM dbo.recon_report rr_pay
        WHERE rr_pay.ClaimID = ${claimAlias}.ClaimID
          AND rr_pay.InsuranceName IN (${params.join(', ')})
      )`);
  }

  // Hierarchical team scoping - Managers see their specialists, Admins see their managers' teams
  let teamSql = '';
  const teamInputs: Array<{ name: string; type: (() => sql.ISqlType) | sql.ISqlType; value: number }> = [];

  // Manager: see claims assigned to self + assigned specialists + unassigned
  if (scope.isManager && scope.teamMemberIds.length > 0) {
    const teamParams = scope.teamMemberIds.map((id, i) => {
      const name = `_teamId${i}`;
      teamInputs.push({ name, type: sql.Int, value: id });
      return `@${name}`;
    });
    teamSql = `
      AND (
        ${claimAlias}.AssignedTo IN (${teamParams.join(', ')})
        OR ${claimAlias}.AssignedTo IS NULL
      )`;
  }

  // Admin: see claims assigned to self + managed managers + their specialists + unassigned
  if (scope.isAdmin && scope.allManagedUserIds.length > 0) {
    const adminParams = scope.allManagedUserIds.map((id, i) => {
      const name = `_adminTeamId${i}`;
      teamInputs.push({ name, type: sql.Int, value: id });
      return `@${name}`;
    });
    teamSql = `
      AND (
        ${claimAlias}.AssignedTo IN (${adminParams.join(', ')})
        OR ${claimAlias}.AssignedTo IS NULL
      )`;
  }

  return {
    sql: fragments.join(''),
    addInputs: (request: sql.Request) => {
      for (const inp of inputs) {
        request.input(inp.name, inp.type, inp.value);
      }
    },
    teamSql,
    addTeamInputs: (request: sql.Request) => {
      for (const inp of teamInputs) {
        request.input(inp.name, inp.type, inp.value);
      }
    },
  };
}

/**
 * Build a parameterized SQL WHERE fragment that restricts rows to the manager's
 * team members (by an arbitrary column expression, e.g. `rr.AssignedTo`).
 *
 * Returns `{ sql, addInputs }` where `sql` is e.g.
 *   `AND rr.AssignedTo IN (@_teamId0, @_teamId1, ...)`
 * and `addInputs` binds the values.
 *
 * If the scope is not a manager or has no team members, returns empty sql
 * (backwards-compatible - callers can inject it safely).
 */
/**
 * Extract the enterprise customer ID from request context.
 * Priority: x-xen-customer-id header -> actor.customer_id from middleware.
 */
export function extractCustomerId(req: { headers: Record<string, unknown> }): number | null {
  // req.actor.customer_id is the authoritative source (set by JWT middleware).
  const actor = (req as any).actor;
  if (actor?.customer_id != null) return actor.customer_id;
  return null;
}

/**
 * Build a customer_id WHERE EXISTS filter for queries on tables that lack a
 * customer_id column (e.g. recon_report, claimhistory).
 * The filter goes through the `claims` table via EXISTS sub-query.
 *
 * Usage:
 *   const cust = buildCustomerFilter(xenCustId, 'rr');
 *   cust.addInputs(request);
 *   // In SQL: FROM recon_report rr WHERE ... ${cust.where}
 *
 * When xenCustId is null the filter is a no-op (empty string).
 */
export function buildCustomerFilter(
  xenCustId: number | null,
  tableAlias: string,
  claimIdColumn = 'ClaimID',
): { where: string; addInputs: (request: sql.Request) => void } {
  if (xenCustId == null) {
    return { where: '', addInputs: () => {} };
  }
  return {
    where: `\n      AND EXISTS (SELECT 1 FROM dbo.claims c_cust WHERE c_cust.ClaimID = ${tableAlias}.${claimIdColumn} AND c_cust.customer_id = @_custId)`,
    addInputs: (request: sql.Request) => {
      request.input('_custId', sql.Int, xenCustId);
    },
  };
}

/**
 * Build a simple customer_id WHERE clause for queries that already reference the `claims` table.
 * Returns empty string when xenCustId is null.
 */
export function buildClaimsCustomerWhere(
  xenCustId: number | null,
  claimsAlias: string,
): { where: string; addInputs: (request: sql.Request) => void } {
  if (xenCustId == null) {
    return { where: '', addInputs: () => {} };
  }
  return {
    where: `\n      AND ${claimsAlias}.customer_id = @_custId`,
    addInputs: (request: sql.Request) => {
      request.input('_custId', sql.Int, xenCustId);
    },
  };
}

export function buildTeamFilter(
  scope: UserScope,
  columnExpr: string,
  prefix = '_teamId',
  includeUnassigned = false,
): { sql: string; addInputs: (request: sql.Request) => void } {
  const unassignedClause = includeUnassigned ? ` OR ${columnExpr} IS NULL` : '';

  // Admin: filter to all managed users (managers + their specialists)
  if (scope.isAdmin && scope.allManagedUserIds.length > 0) {
    const inputs: Array<{ name: string; value: number }> = [];
    const params = scope.allManagedUserIds.map((id, i) => {
      const name = `${prefix}${i}`;
      inputs.push({ name, value: id });
      return `@${name}`;
    });
    return {
      sql: `\n      AND (${columnExpr} IN (${params.join(', ')})${unassignedClause})`,
      addInputs: (request: sql.Request) => {
        for (const inp of inputs) request.input(inp.name, sql.Int, inp.value);
      },
    };
  }

  // Manager: filter to self + assigned specialists (+ unassigned when includeUnassigned=true)
  if (scope.isManager && scope.teamMemberIds.length > 0) {
    const inputs: Array<{ name: string; value: number }> = [];
    const params = scope.teamMemberIds.map((id, i) => {
      const name = `${prefix}${i}`;
      inputs.push({ name, value: id });
      return `@${name}`;
    });
    return {
      sql: `\n      AND (${columnExpr} IN (${params.join(', ')})${unassignedClause})`,
      addInputs: (request: sql.Request) => {
        for (const inp of inputs) request.input(inp.name, sql.Int, inp.value);
      },
    };
  }

  // AR Specialist / Super Admin / no team scope: no filter
  return { sql: '', addInputs: () => {} };
}
