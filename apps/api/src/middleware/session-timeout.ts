import { Request, Response, NextFunction } from 'express';
import Database from '../modules/db';
import sql from 'mssql';
import logger from '../utils/logger';

/**
 * Session Timeout Middleware
 *
 * HIPAA Sec.164.312(a)(2)(iii) - Automatic logoff.
 *
 * - Updates Users.last_activity_at on every authenticated request.
 * - Checks if last_activity_at > SESSION_TIMEOUT_MINUTES ago.
 * - Returns 401 with code 'SESSION_EXPIRED' if expired.
 * - Default timeout: 30 minutes.
 */

// HIPAA Sec.164.312(a)(2)(iii) - automatic logoff after inactivity.
// Default 30 minutes per HIPAA guidance for clinical workstations.
// Override via SESSION_TIMEOUT_MINUTES env var (minimum 5, maximum 480).
const rawTimeout = parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30', 10);
const SESSION_TIMEOUT_MINUTES = Math.max(5, Math.min(480, isNaN(rawTimeout) ? 30 : rawTimeout));

export function sessionTimeout() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // When impersonating, x-actor-email is overridden to the impersonated user.
    // Use the OID to find the real actor, or fall back to x-actor-email.
    const oid = req.headers['x-actor-oid'] as string | undefined;
    let actorEmail: string | undefined;
    if (oid && req.headers['x-impersonate-user-id']) {
      // Impersonating - resolve real actor by OID, not the overridden email
      try {
        const pool = Database.getInstance().getPool();
        const oidResult = await pool.request()
          .input('oid', sql.NVarChar, oid)
          .query(`SELECT TOP 1 Email FROM dbo.Users WHERE azure_oid = @oid`);
        actorEmail = oidResult.recordset[0]?.Email;
      } catch { /* fall through */ }
    }
    if (!actorEmail) {
      actorEmail = (req.headers['x-actor-email'] as string) || (req as any).actor?.email;
    }
    if (!actorEmail) {
      // No authenticated user - skip session check
      return next();
    }

    try {
      const pool = Database.getInstance().getPool();

      // Check last activity
      const result = await pool.request()
        .input('email', sql.NVarChar, actorEmail.toLowerCase())
        .query(`
          SELECT TOP 1 last_activity_at
          FROM dbo.Users
          WHERE LOWER(Email) = @email
        `);

      if (result.recordset.length) {
        const lastActivity = result.recordset[0].last_activity_at;
        if (lastActivity) {
          const elapsed = (Date.now() - new Date(lastActivity).getTime()) / 60000;
          if (elapsed > SESSION_TIMEOUT_MINUTES) {
            // Allow through if the session token itself was freshly issued - that
            // is a new login after an idle period, not an abandoned session.
            // The token verifier publishes the issued-at as a header; reading
            // req.user here was a long-standing bug, because nothing ever
            // created req.user, so this escape hatch could never fire.
            const iatHeader = req.headers['x-actor-token-iat'];
            const parsedIat = Number(Array.isArray(iatHeader) ? iatHeader[0] : iatHeader);
            const iat: number | undefined = Number.isFinite(parsedIat) ? parsedIat : undefined;
            const tokenAgeMinutes = iat ? (Date.now() / 1000 - iat) / 60 : Infinity;
            if (tokenAgeMinutes > SESSION_TIMEOUT_MINUTES) {
              logger.info(`[SESSION] Expired after ${elapsed.toFixed(0)}m inactivity for ${actorEmail}`);
              res.status(401).json({ message: 'Session expired', code: 'SESSION_EXPIRED' });
              return;
            }
            logger.info(`[SESSION] Stale last_activity_at for ${actorEmail} but JWT is fresh (${tokenAgeMinutes.toFixed(0)}m old) \u2014 resetting`);
          }
        }
      }

      // Update last_activity_at - always refresh on valid request
      try {
        await pool.request()
          .input('email', sql.NVarChar, actorEmail.toLowerCase())
          .query(`
            UPDATE dbo.Users
            SET last_activity_at = GETDATE()
            WHERE LOWER(Email) = @email
          `);
      } catch (err: any) {
        logger.error(`[SESSION] Failed to update last_activity_at: ${err?.message}`);
      }

      next();
    } catch (err: any) {
      logger.error(`[SESSION] Timeout check error: ${err?.message}`);
      // Non-fatal - don't block the request
      next();
    }
  };
}
