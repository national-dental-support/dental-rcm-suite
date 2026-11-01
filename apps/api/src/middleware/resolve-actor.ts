import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import logger from '../utils/logger';
import Database from '../modules/db';
import { runAsSystem } from '../modules/rls-context';
import { vendorTenantId } from '../utils/vendor-tenant';

/**
 * Resolves the calling user's identity and attaches it to req.actor.
 *
 * The acting email arrives as a header set by the token verifier - never by the
 * caller. Everything else about the actor is read from dbo.Users, so a token
 * can state who you are but not what you may do.
 *
 * This middleware does NOT enforce a role level; that is requireRole's job. It
 * does enforce account state (disabled, archived, locked) and it authorises the
 * two context switches a Super Admin may perform.
 */

export interface Actor {
  userId: number;
  email: string;
  oid?: string;
  role: string;
  customer_id: number | null;
  /** The user's own tenant, captured before any switching. */
  homeCustomerId: number | null;
  providerId?: number | null;
  isSuperAdmin: boolean;
  /** True when acting inside another tenant via x-xen-customer-id. */
  tenantAdmin?: boolean;
  /** Set to the real caller's id while impersonating. */
  impersonatedBy?: number;
}

export class ActorResolutionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ActorResolutionError';
  }
}

interface UserRow {
  userID: number;
  Role: string;
  customer_id: number | null;
  disabled: boolean;
  archived: boolean;
  locked_until: Date | null;
  ProviderID: number | null;
  email_lc: string;
}

const USER_COLUMNS = `
  userID, Role, customer_id, disabled, archived, locked_until,
  ProviderID, LOWER(Email) AS email_lc
`;

async function findByEmail(pool: sql.ConnectionPool, email: string): Promise<UserRow | null> {
  const r = await pool
    .request()
    .input('email', sql.NVarChar(255), email)
    .query<UserRow>(`SELECT TOP 1 ${USER_COLUMNS} FROM dbo.Users WHERE LOWER(Email) = @email`);
  return r.recordset[0] ?? null;
}

async function findById(pool: sql.ConnectionPool, userId: number): Promise<UserRow | null> {
  const r = await pool
    .request()
    .input('id', sql.Int, userId)
    .query<UserRow>(`SELECT TOP 1 ${USER_COLUMNS} FROM dbo.Users WHERE userID = @id`);
  return r.recordset[0] ?? null;
}

/**
 * Record a privileged context switch. The write is deliberately blocking: if we
 * cannot audit an impersonation or a tenant switch, we do not permit it.
 */
async function auditOrRefuse(
  pool: sql.ConnectionPool,
  entry: { actorId: number; actorRole: string; action: string; targetId: string; entityType: string },
): Promise<void> {
  try {
    await pool
      .request()
      .input('actor_id', sql.Int, entry.actorId)
      .input('actor_role', sql.NVarChar(50), entry.actorRole)
      .input('action', sql.NVarChar(100), entry.action)
      .input('target_id', sql.NVarChar(100), entry.targetId)
      .input('entity_type', sql.NVarChar(50), entry.entityType)
      .query(`
        INSERT INTO dbo.AdminAuditLog (actor_id, actor_role, action, target_id, entity_type, timestamp)
        VALUES (@actor_id, @actor_role, @action, @target_id, @entity_type, SYSUTCDATETIME())
      `);
  } catch (err) {
    logger.error('[ResolveActor] audit write failed - refusing the context switch', {
      action: entry.action,
      error: err instanceof Error ? err.message : String(err),
      alert: 'AUDIT_WRITE_FAILED',
    });
    throw new ActorResolutionError('Unable to record the audit entry for this action', 403);
  }
}

function assertUsable(user: UserRow): void {
  if (user.disabled) throw new ActorResolutionError('Account is disabled', 403);
  if (user.archived) throw new ActorResolutionError('Account is archived', 403);
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new ActorResolutionError('Account is temporarily locked', 403);
  }
}

async function build(pool: sql.ConnectionPool, req: Request): Promise<Actor | null> {
  const email = String(req.headers['x-actor-email'] ?? '').trim().toLowerCase();
  const oid = String(req.headers['x-actor-oid'] ?? '').trim() || undefined;

  // No asserted identity: anonymous. Route guards decide whether that is allowed.
  if (!email) return null;

  const user = await findByEmail(pool, email);
  if (!user) throw new ActorResolutionError('No account found for the authenticated user', 401);
  assertUsable(user);

  const vendorTenant = vendorTenantId();
  const isSuperAdmin =
    user.Role === 'Super Admin' ||
    (vendorTenant != null && user.customer_id === vendorTenant && user.Role === 'Admin');

  const actor: Actor = {
    userId: user.userID,
    email: user.email_lc,
    oid,
    role: user.Role,
    customer_id: user.customer_id,
    homeCustomerId: user.customer_id,
    providerId: user.ProviderID,
    isSuperAdmin,
  };

  // -- Impersonation --------------------------------------------------------
  const impersonateHeader = req.headers['x-impersonate-user-id'];
  if (impersonateHeader) {
    const targetId = Number(impersonateHeader);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      throw new ActorResolutionError('Invalid impersonation target', 400);
    }
    if (!actor.isSuperAdmin) {
      throw new ActorResolutionError('Impersonation requires Super Admin', 403);
    }

    const target = await findById(pool, targetId);
    if (!target) throw new ActorResolutionError('Impersonation target not found', 404);
    assertUsable(target);

    await auditOrRefuse(pool, {
      actorId: user.userID,
      actorRole: user.Role,
      action: 'impersonate_start',
      targetId: String(targetId),
      entityType: 'user',
    });

    // Become the target entirely. The oid is dropped so no downstream scope
    // lookup can fall back to the impersonator's own row.
    return {
      userId: target.userID,
      email: target.email_lc,
      oid: undefined,
      role: target.Role,
      customer_id: target.customer_id,
      homeCustomerId: target.customer_id,
      providerId: target.ProviderID,
      isSuperAdmin: false,
      impersonatedBy: user.userID,
    };
  }

  // -- Tenant switch --------------------------------------------------------
  const tenantHeader = req.headers['x-xen-customer-id'];
  if (tenantHeader) {
    const targetTenant = Number(tenantHeader);
    if (!Number.isInteger(targetTenant) || targetTenant <= 0) {
      throw new ActorResolutionError('Invalid tenant id', 400);
    }
    if (!actor.isSuperAdmin) {
      throw new ActorResolutionError('Switching tenant requires Super Admin', 403);
    }

    await auditOrRefuse(pool, {
      actorId: user.userID,
      actorRole: user.Role,
      action: 'tenant_switch',
      targetId: String(targetTenant),
      entityType: 'customer',
    });

    actor.customer_id = targetTenant;
    // Inside another tenant the caller is a tenant admin, not a Super Admin:
    // this narrows what they can reach rather than widening it.
    actor.isSuperAdmin = false;
    actor.tenantAdmin = true;
    return actor;
  }

  // A Super Admin with no explicit tenant is not scoped to their own home org,
  // which is an internal org rather than a client tenant.
  if (actor.isSuperAdmin) actor.customer_id = null;

  return actor;
}

export async function resolveActor(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if ((req as any).actor) return next();

  try {
    const pool = Database.getInstance().getPool();
    // This dbo.Users read is what RESOLVES the tenant, so it runs before tenant
    // context exists. Under the RLS-enforcing application login it would
    // otherwise fail closed to zero rows.
    const actor = await runAsSystem(() => build(pool as any, req));
    if (actor) (req as any).actor = actor;
  } catch (err) {
    if (err instanceof ActorResolutionError) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    logger.error('[ResolveActor] identity resolution failed', {
      error: err instanceof Error ? err.message : String(err),
      alert: 'ACTOR_RESOLUTION_FAILED',
    });
    res.status(500).json({ message: 'Internal server error' });
    return;
  }

  next();
}
