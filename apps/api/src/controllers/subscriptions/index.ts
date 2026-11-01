import { Request, Response } from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../database-connection-controller';

export class SubscriptionsController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * GET /api/subscriptions/my-org
   * Single-customer platform: all users get all products.
   * Super Admins additionally receive the 'superadmin' slug.
   * Reads x-actor-email header.
   */
  public getMyOrg = async (req: Request, res: Response): Promise<Response> => {
    // resolveActor runs before every /api route and matches by OID *or* email,
    // so use it as the primary source - avoids email-format mismatches between
    // Azure AD preferred_username and the email stored in the Users table.
    const actor = (req as any).actor as { userID?: number; role?: string; customer_id?: number; permissions?: Record<string, boolean> } | undefined;

    const actorEmail = (req.headers['x-actor-email'] as string | undefined)?.toLowerCase().trim();
    const actorOid   = (req.headers['x-actor-oid']   as string | undefined);

    if (!actor && !actorEmail && !actorOid) {
      return res.status(400).json({ message: 'x-actor-email header is required.' });
    }

    try {
      const pool = this.pool;

      let userResult: { recordset: any[] };

      if (actor?.userID) {
        // Fast path: resolveActor already identified the user
        userResult = await pool.request()
          .input('userId', sql.Int, actor.userID)
          .query(`
            SELECT TOP 1 u.userID, u.customer_id AS customerId, u.Role, ISNULL(u.permissions, '{}') AS permissionsJson
            FROM dbo.Users u
            WHERE u.userID = @userId
          `);
      } else {
        // Fallback: match by OID then email
        const request = pool.request();
        let query = `SELECT TOP 1 u.userID, u.customer_id AS customerId, u.Role, ISNULL(u.permissions, '{}') AS permissionsJson FROM dbo.Users u WHERE `;
        if (actorOid) {
          request.input('oid', sql.NVarChar, actorOid);
          if (actorEmail) {
            request.input('email', sql.NVarChar, actorEmail);
            query += `azure_oid = @oid OR LOWER(u.Email) = @email ORDER BY CASE WHEN azure_oid = @oid THEN 0 ELSE 1 END`;
          } else {
            query += `azure_oid = @oid`;
          }
        } else {
          request.input('email', sql.NVarChar, actorEmail!);
          query += `LOWER(u.Email) = @email`;
        }
        userResult = await request.query(query);
      }

      if (!userResult.recordset.length) {
        return res.status(404).json({ message: 'User not found.' });
      }

      const { userID, customerId, Role, permissionsJson } = userResult.recordset[0];
      let permissions: Record<string, boolean> = {};
      /* istanbul ignore next */
      try { permissions = JSON.parse(permissionsJson || '{}'); } catch { /* ignore */ }

      // Super Admins: respect ProductSubscriptions for their customer, always add superadmin slug
      if (Role === 'Super Admin') {
        const productResult = await pool.request()
          .input('customerId', sql.Int, customerId)
          .query(`
            SELECT p.slug FROM dbo.Products p
            JOIN dbo.ProductSubscriptions ps ON ps.product_id = p.id
            WHERE p.is_active = 1 AND p.slug != 'superadmin'
              AND ps.customer_id = @customerId AND ps.is_active = 1
              AND ps.location_id IS NULL
            ORDER BY p.nav_order
          `);
        const subscriptions: string[] = productResult.recordset.map((r: any) => r.slug);
        subscriptions.push('superadmin');
        return res.json({ customerId, subscriptions, role: Role, permissions: { ...permissions, techMonitoringAccess: true } });
      }

      // All other users: return only their assigned products
      if (!userID) {
        return res.json({ customerId: null, subscriptions: [], role: Role, permissions });
      }

      // Check user-level product assignments first, then fall back to customer-level
      const subResult = await pool.request()
        .input('userId', sql.Int, userID)
        .query(`
          SELECT DISTINCT p.slug, p.nav_order
          FROM dbo.Products p
          WHERE p.is_active = 1 AND p.slug != 'superadmin'
            AND (
              EXISTS (
                SELECT 1 FROM dbo.UserProducts up
                WHERE up.product_id = p.id AND up.user_id = @userId AND up.is_active = 1
              )
              OR EXISTS (
                SELECT 1 FROM dbo.ProductSubscriptions ps
                JOIN dbo.Users u ON u.customer_id = ps.customer_id
                WHERE ps.product_id = p.id AND u.userID = @userId AND ps.is_active = 1
              )
            )
          ORDER BY p.nav_order
        `);

      const subscriptions = subResult.recordset.map((r: any) => r.slug);
      // Also grant tech monitoring access for Admin role
      if (Role === 'Admin') {
        permissions = { ...permissions, techMonitoringAccess: true };
      }
      return res.json({ customerId: null, subscriptions, role: Role, permissions });
    } catch (err: any) {
      console.error('[subscriptions] getMyOrg error:', err.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /api/subscriptions/products
   * Returns all active products (public catalog - used to build home-page tiles).
   */
  public getProducts = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = this.pool;
      const result = await pool.request().query(`
        SELECT id, slug, name, icon, nav_route AS navRoute, nav_order AS navOrder, is_active AS isActive
        FROM dbo.Products
        WHERE is_active = 1
        ORDER BY nav_order
      `);
      return res.json({ data: result.recordset });
    } catch (err) {
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
