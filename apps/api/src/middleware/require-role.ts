import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import Database from '../modules/db';
import logger from '../utils/logger';
import { resolveClientTenantCustomerId } from '../utils/tenant-filter';
// G7 system-path bypass: the dbo.Users role lookup runs before/independent of the
// tenant context and must see rows across tenants (impersonation targets included).
// DB reads below run under runAsSystem - next()/responses stay OUTSIDE it.
import { runAsSystem } from '../modules/rls-context';

/**
 * Middleware factory that enforces role-based access control.
 *
 * Usage: requireRole('Admin') - allows Admin and Super Admin.
 *        requireRole('Manager') - allows Manager, Admin, Super Admin.
 *
 * The caller must set the `x-actor-email` request header. The middleware
 * looks up the user's Role in the database and compares against the
 * hierarchy. Returns 403 if the role is insufficient or the user is not found.
 */

const ROLE_HIERARCHY: Record<string, number> = {
  'User': 0,
  'AR Specialist': 1,
  'Manager': 2,
  'Training Admin': 3,
  'Admin': 4,
  'Super Admin': 5,
};

export function requireRole(minimumRole: string) {
  // Fail CLOSED on an unknown/mistyped role. Previously this defaulted to level 3
  // (Training Admin), which silently under-protected a route on a typo. Now an
  // unrecognized role requires an impossibly-high level (denies everyone) and logs
  // loudly, so a misconfiguration is a visible outage, not a hidden privilege hole.
  const knownLevel = ROLE_HIERARCHY[minimumRole];
  if (knownLevel === undefined) {
    logger.error(
      `[requireRole] Unknown role "${minimumRole}" - denying all access. Valid roles: ${Object.keys(ROLE_HIERARCHY).join(', ')}`
    );
  }
  const minLevel = knownLevel ?? Number.MAX_SAFE_INTEGER;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // If a prior middleware (requireSubscription, resolveActor) already resolved and
    // verified the actor (including impersonation), just check the role and move on.
    if ((req as any).actor) {
      const effectiveRole = (req as any).actor.role;
      const effectiveLevel = ROLE_HIERARCHY[effectiveRole] ?? -1;
      if (effectiveLevel < minLevel) {
        res.status(403).json({
          message: `Forbidden: "${minimumRole}" or higher role required. Your role: "${effectiveRole}".`,
        });
        return;
      }
      return next();
    }

    const actorOid = req.headers['x-actor-oid'] as string | undefined;
    const actorEmail = (req.headers['x-actor-email'] as string | undefined)?.toLowerCase().trim();

    if (!actorOid && !actorEmail) {
      res.status(403).json({ message: 'Forbidden: x-actor-email or x-actor-oid header required.' });
      return;
    }

    try {
      const databaseInstance = Database.getInstance();
      const pool = databaseInstance.getPool();

      const request = pool.request();

      // Check if azure_oid column exists (may not on fresh DBs before migration 069)
      let hasOidCol = true;
      try {
        const colCheck = await runAsSystem(() => pool.request().query(
          `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Users' AND COLUMN_NAME='azure_oid'`
        ));
        hasOidCol = colCheck.recordset.length > 0;
      } catch { hasOidCol = false; }

      let userQuery = `
        SELECT TOP 2 userID, Role, disabled, archived, locked_until, customer_id, ProviderID${hasOidCol ? ', azure_oid, LOWER(Email) AS email_lc' : ''}
        FROM dbo.Users
      `;

      // OID match first (immutable, preferred), then email fallback
      if (actorOid && hasOidCol) {
        request.input('oid', sql.NVarChar(36), actorOid);
        if (actorEmail) {
          request.input('email', sql.NVarChar, actorEmail);
          userQuery += ` WHERE azure_oid = @oid OR LOWER(Email) = @email ORDER BY CASE WHEN azure_oid = @oid THEN 0 ELSE 1 END`;
        } else {
          userQuery += ` WHERE azure_oid = @oid`;
        }
      } else if (actorEmail) {
        request.input('email', sql.NVarChar, actorEmail);
        userQuery += ` WHERE LOWER(Email) = @email`;
      } else if (actorOid) {
        // OID provided but column doesn't exist - can't look up
        res.status(403).json({ message: 'Forbidden: Actor account not found (azure_oid column missing).' });
        return;
      }

      const result = await runAsSystem(() => request.query(userQuery));

      if (!result.recordset.length) {
        logger.warn(`requireRole: actor "${actorEmail ?? actorOid}" not found in Users table`);
        res.status(403).json({ message: 'Forbidden: Actor account not found.' });
        return;
      }

      let user = result.recordset[0];

      // OID-email conflict: OID matched user A but email matched user B.
      // Prefer the email match (canonical identity from Azure token).
      if (actorOid && actorEmail && result.recordset.length === 2) {
        const oidUser   = result.recordset[0];
        const emailUser = result.recordset[1];
        if (oidUser.userID !== emailUser.userID) {
          user = emailUser;
          runAsSystem(() => pool.request()
            .input('oid', sql.NVarChar(36), actorOid)
            .input('wrongId', sql.Int, oidUser.userID)
            .input('rightId', sql.Int, emailUser.userID)
            .query(`UPDATE dbo.Users SET azure_oid = NULL WHERE userID = @wrongId AND azure_oid = @oid;
                    UPDATE dbo.Users SET azure_oid = @oid WHERE userID = @rightId AND azure_oid IS NULL;`))
            .catch(err => logger.warn(`OID re-link failed: ${err.message}`));
        }
      }

      // Auto-link OID on first login if not already stored
      // Skip during impersonation - the OID belongs to the Super Admin, not the impersonated user
      const isImpersonating = !!req.headers['x-impersonate-user-id'];
      if (actorOid && hasOidCol && !user.azure_oid && !isImpersonating) {
        runAsSystem(() => pool.request()
          .input('oid', sql.NVarChar(36), actorOid)
          .input('id', sql.Int, user.userID)
          .query(`UPDATE dbo.Users SET azure_oid = @oid WHERE userID = @id AND azure_oid IS NULL`))
          .catch(err => logger.warn(`Failed to auto-link OID for user ${user.userID}: ${err.message}`));
      }

      if (user.disabled || user.archived) {
        logger.warn(`requireRole: actor "${actorEmail}" is disabled/archived`);
        res.status(403).json({ message: 'Forbidden: Actor account is inactive.' });
        return;
      }

      // Check account lockout
      if (user.locked_until && new Date() < new Date(user.locked_until)) {
        const mins = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
        logger.warn(`requireRole: actor "${actorEmail}" is locked for ${mins} more minute(s)`);
        res.status(403).json({
          message: `Account is locked due to too many failed attempts. Try again in ${mins} minute(s).`,
          locked: true,
          lockoutExpiresAt: user.locked_until,
        });
        return;
      }

      // Attach actor info for downstream use (e.g. writeAuditLog)
      // isSuperAdmin flag allows downstream code to bypass tenant filters when appropriate
      (req as any).actor = {
        email: actorEmail ?? user.azure_oid,
        role: user.Role,
        customer_id: user.customer_id,
        providerId: user.ProviderID ?? null,
        isSuperAdmin: user.Role === 'Super Admin',
      };

      // Impersonation: Super Admin can act as another user.
      // If x-actor-email is already the impersonated user's email (mid-impersonation),
      // the found user won't be Super Admin - just skip the block and proceed as that user.
      const impersonateId = req.headers['x-impersonate-user-id'] as string | undefined;
      if (impersonateId && user.Role === 'Super Admin') {
        try {
          const targetResult = await runAsSystem(() => pool.request()
            .input('targetId', sql.Int, parseInt(impersonateId, 10))
            .query(`SELECT userID, Role, customer_id, Email, FirstName, LastName, ProviderID${hasOidCol ? ', azure_oid' : ''}
                    FROM dbo.Users WHERE userID = @targetId`));

          if (!targetResult.recordset.length) {
            res.status(404).json({ message: 'Impersonation target user not found.' });
            return;
          }

          const target = targetResult.recordset[0];

          // Log to AdminAuditLog
          try {
            await runAsSystem(() => pool.request()
              .input('actorId', sql.Int, user.userID)
              .input('actorRole', sql.NVarChar, 'Super Admin')
              .input('action', sql.NVarChar, 'impersonate')
              .input('targetId', sql.NVarChar, String(target.userID))
              .input('entityType', sql.NVarChar, 'user')
              .input('details', sql.NVarChar, JSON.stringify({ targetEmail: target.Email, targetRole: target.Role }))
              .query(`INSERT INTO dbo.AdminAuditLog
                      (actor_id, actor_role, action, target_id, entity_type, before_state, timestamp)
                      VALUES (@actorId, @actorRole, @action, @targetId, @entityType, @details, GETDATE())`));
          } catch { /* audit log failure is non-fatal */ }

          // Override req.actor with target user's identity
          (req as any).actor = {
            email: target.Email,
            role: target.Role,
            customer_id: target.customer_id,
            providerId: target.ProviderID ?? null,
            isSuperAdmin: target.Role === 'Super Admin',
            impersonatedBy: user.userID,  // Track the real Super Admin
          };

          // Override the request headers so downstream resolveUserScope() picks up the target.
          // Do NOT delete x-actor-oid - it belongs to the real caller and must stay intact.
          (req.headers as any)['x-actor-email'] = target.Email;

          logger.info(`Impersonation: Super Admin ${user.userID} (${actorEmail}) acting as user ${target.userID} (${target.Email})`);
        } catch (err: any) {
          logger.error('Impersonation lookup failed', { error: err.message });
          // Continue as the real user if impersonation lookup fails
        }
      }

      // Enterprise switching: only scope on explicit x-xen-customer-id header.
      // CLIENT_TENANT_SLUG auto-scope is handled by resolveUserScope in data controllers.
      // Setting isSuperAdmin=false for auto-scope would hide the enterprise-switcher.
      if ((req as any).actor.isSuperAdmin) {
        const xenCustIdHeader = req.headers['x-xen-customer-id'] as string | undefined;
        if (xenCustIdHeader) {
          const switchedToCustomerId = parseInt(xenCustIdHeader, 10);
          (req as any).actor.customer_id = switchedToCustomerId;
          (req as any).actor.isSuperAdmin = false;
          (req as any).actor.tenantAdmin = true;
          logger.info(`Enterprise tenant switch: Super Admin "${actorEmail ?? actorOid}" scoped to customer_id=${switchedToCustomerId} on ${req.method} ${req.path}`);
        } else {
          // No explicit tenant switch - clear SA home-org customer_id so resolveUserScope
          // can apply CLIENT_TENANT_SLUG auto-scope or fall through to no-filter behavior.
          (req as any).actor.customer_id = null;
        }
      }

      // Role hierarchy check - uses impersonated role if impersonating
      const effectiveRole = (req as any).actor.role;
      const effectiveLevel = ROLE_HIERARCHY[effectiveRole] ?? -1;

      if (effectiveLevel < minLevel) {
        logger.warn(`requireRole: actor "${(req as any).actor.email}" has role "${effectiveRole}" (level ${effectiveLevel}), requires level ${minLevel}${(req as any).actor.impersonatedBy ? ` [impersonated by Super Admin ${(req as any).actor.impersonatedBy}]` : ''}`);
        res.status(403).json({
          message: `Forbidden: "${minimumRole}" or higher role required. Your role: "${effectiveRole}".`,
        });
        return;
      }

      next();
    } catch (err) {
      logger.error(`requireRole: DB error checking role for "${actorEmail}": ${err}`);
      res.status(500).json({ message: 'Internal server error during role check.' });
    }
  };
}
