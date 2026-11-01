import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import Database from '../modules/db';
import logger from '../utils/logger';
// G7 system-path bypass: Users/Products/UserProducts/ProductSubscriptions are
// RLS-scoped by customer_id; the entitlement check must see all rows. DB reads
// below run under runAsSystem - next()/responses stay OUTSIDE it so downstream
// handlers keep the request's tenant context.
import { runAsSystem } from '../modules/rls-context';

// In-memory cache: key = "email:slug", value = allowed boolean, TTL 90 seconds.
// Eliminates 1-3 DB round-trips per request for repeat callers.
const CACHE_TTL_MS = 90_000;
const subCache = new Map<string, { allowed: boolean; expiresAt: number }>();

// One-time check: does dbo.Users have an azure_oid column?
// Resolves once on the first call and is reused for the lifetime of the process.
let hasOidColPromise: Promise<boolean> | null = null;
function getHasOidCol(): Promise<boolean> {
  if (!hasOidColPromise) {
    hasOidColPromise = runAsSystem(() => Database.getInstance().getPool()
      .request()
      .query(`SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Users' AND COLUMN_NAME='azure_oid'`))
      .then(r => r.recordset.length > 0)
      .catch(() => false);
  }
  return hasOidColPromise;
}

/**
 * Middleware factory that enforces product subscription access.
 *
 * Usage: requireSubscription('denial-iq')
 *
 * Checks the `x-actor-email` header against the Users table to get user_id,
 * then verifies the user has an active subscription to the product via
 * UserProducts (user-level) or ProductSubscriptions (customer-level).
 *
 * Super Admins bypass automatically.
 */
export function requireSubscription(productSlug: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const actorOid = req.headers['x-actor-oid'] as string | undefined;
    const actorEmail = (req.headers['x-actor-email'] as string | undefined)?.toLowerCase().trim();

    if (!actorOid && !actorEmail) {
      res.status(403).json({ message: 'Forbidden: x-actor-email or x-actor-oid header required.' });
      return;
    }

    // Cache hit (allowed only - denials are never cached so role upgrades take effect immediately)
    const cacheKeyEmail = actorEmail ? `${actorEmail}:${productSlug}` : '';
    const cacheKeyOid = actorOid ? `oid:${actorOid}:${productSlug}` : '';
    const cached = (cacheKeyOid ? subCache.get(cacheKeyOid) : undefined) ?? (cacheKeyEmail ? subCache.get(cacheKeyEmail) : undefined);
    if (cached && cached.expiresAt > Date.now() && cached.allowed) {
      // Cache says allowed - still need to resolve actor for tenant isolation
      // Fall through to the full middleware to set req.actor properly
    }

    try {
      const databaseInstance = Database.getInstance();
      const pool = databaseInstance.getPool();

      // Check if azure_oid column exists (cached for process lifetime)
      const hasOidCol = await getHasOidCol();

      // Get user info - OID match first, email fallback
      const userRequest = pool.request();
      let userQuery = `
        SELECT TOP 1 userID, Role, customer_id${hasOidCol ? ', azure_oid' : ''}
        FROM dbo.Users
      `;

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
      } else if (actorOid) {
        res.status(403).json({ message: 'Forbidden: User not found (azure_oid column missing).' });
        return;
      }

      const userResult = await runAsSystem(() => userRequest.query(userQuery));

      if (!userResult.recordset.length) {
        res.status(403).json({ message: 'Forbidden: User not found.' });
        return;
      }

      let user = userResult.recordset[0];

      // Auto-link OID on first login if not already stored
      if (actorOid && hasOidCol && !user.azure_oid) {
        runAsSystem(() => pool.request()
          .input('oid', sql.NVarChar(36), actorOid)
          .input('id', sql.Int, user.userID)
          .query(`UPDATE dbo.Users SET azure_oid = @oid WHERE userID = @id AND azure_oid IS NULL`))
          .catch(err => logger.warn(`Failed to auto-link OID for user ${user.userID}: ${err.message}`));
      }

      // Impersonation: Super Admin can act as another user.
      // If x-actor-email is already the impersonated user's email (mid-impersonation),
      // the found user won't be Super Admin - just skip the block and proceed as that user.
      const impersonateId = req.headers['x-impersonate-user-id'] as string | undefined;
      if (impersonateId && user.Role === 'Super Admin') {
        try {
          const targetResult = await runAsSystem(() => pool.request()
            .input('targetId', sql.Int, parseInt(impersonateId, 10))
            .query(`SELECT userID, Role, customer_id, Email, ProviderID${hasOidCol ? ', azure_oid' : ''}
                    FROM dbo.Users WHERE userID = @targetId`));

          if (!targetResult.recordset.length) {
            res.status(404).json({ message: 'Impersonation target user not found.' });
            return;
          }

          const realUserId = user.userID;
          // Override user with target so subscription checks evaluate against them
          user = targetResult.recordset[0];

          // Override email header so downstream resolveUserScope() picks up the target.
          // Do NOT touch x-actor-oid - it belongs to the real caller (Super Admin) and
          // is needed by any subsequent requireRole middleware to identify them.
          (req.headers as any)['x-actor-email'] = user.Email || actorEmail;

          // Set req.actor for downstream controllers
          (req as any).actor = {
            email: user.Email || actorEmail,
            role: user.Role,
            customer_id: user.customer_id,
            providerId: user.ProviderID ?? null,
            isSuperAdmin: user.Role === 'Super Admin',
            impersonatedBy: realUserId,
          };

          logger.info(`requireSubscription: Impersonation \u2014 Super Admin ${realUserId} acting as user ${user.userID} for product "${productSlug}"`);
        } catch (err: any) {
          logger.error('requireSubscription: Impersonation lookup failed', { error: err.message });
          // Continue as the real user if impersonation lookup fails
        }
      }

      // Helper to set cache under both OID and email keys
      const setCache = (allowed: boolean) => {
        const entry = { allowed, expiresAt: Date.now() + CACHE_TTL_MS };
        if (cacheKeyOid) subCache.set(cacheKeyOid, entry);
        if (cacheKeyEmail) subCache.set(cacheKeyEmail, entry);
      };

      // Enterprise switching: only scope on explicit x-xen-customer-id header.
      // CLIENT_TENANT_SLUG data-scoping is handled by resolveUserScope in controllers -
      // putting it in actor.customer_id here causes the frontend to treat the auto-scoped
      // tenant as "currently selected" and hide it from the enterprise-switcher dropdown.
      // Super Admin home-org customer_id (e.g. 7) must NOT be used as a data filter -
      // use null so resolveUserScope falls through to CLIENT_TENANT_SLUG or no-filter.
      const xenCustIdHeader = req.headers['x-xen-customer-id'] as string | undefined;
      if (user.Role === 'Super Admin') {
        const isSuperAdmin = !xenCustIdHeader;
        (req as any).actor = {
          email: actorEmail ?? user.Email,
          role: user.Role,
          customer_id: xenCustIdHeader ? parseInt(xenCustIdHeader, 10) : null,
          providerId: user.ProviderID ?? null,
          isSuperAdmin,
          tenantAdmin: !isSuperAdmin,
        };
        setCache(true);
        next();
        return;
      }

      // Check user-level subscription (UserProducts)
      const subResult = await runAsSystem(() => pool.request()
        .input('userId', sql.Int, user.userID)
        .input('slug', sql.NVarChar, productSlug)
        .query(`
          SELECT TOP 1 1 AS has_access
          FROM dbo.UserProducts up
          JOIN dbo.Products p ON p.id = up.product_id
          WHERE up.user_id = @userId
            AND up.is_active = 1
            AND p.is_active = 1
            AND p.slug = @slug
        `));

      if (subResult.recordset.length) {
        setCache(true);
        next();
        return;
      }

      // Fallback: check customer-level subscription (ProductSubscriptions)
      if (user.customer_id) {
        const custResult = await runAsSystem(() => pool.request()
          .input('customerId', sql.Int, user.customer_id)
          .input('slug', sql.NVarChar, productSlug)
          .query(`
            SELECT TOP 1 1 AS has_access
            FROM dbo.ProductSubscriptions ps
            JOIN dbo.Products p ON p.id = ps.product_id
            WHERE ps.customer_id = @customerId
              AND ps.is_active = 1
              AND p.is_active = 1
              AND p.slug = @slug
          `));

        if (custResult.recordset.length) {
          setCache(true);
          next();
          return;
        }
      }

      logger.warn(`requireSubscription: "${actorEmail ?? actorOid}" does not have access to "${productSlug}"`);
      res.status(403).json({
        message: `Your organization does not have access to ${productSlug}. Please contact your administrator.`,
        subscriptionRequired: true,
        product: productSlug,
      });
    } catch (err) {
      logger.error(`requireSubscription: DB error for "${actorEmail}": ${err}`);
      res.status(500).json({ message: 'Internal server error during subscription check.' });
    }
  };
}
