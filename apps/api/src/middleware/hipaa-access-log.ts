import { Request, Response, NextFunction } from 'express';
import Database from '../modules/db';
import sql from 'mssql';
import logger from '../utils/logger';
import { runAsSystem } from '../modules/rls-context';

/**
 * HIPAA Access Log Middleware
 *
 * Logs every access to patient data for HIPAA Sec.164.312(b) audit trail.
 * Fire-and-forget - never blocks the response.
 *
 * Extracts:
 *   - user_id from req.actor
 *   - patient_id from URL params or response body
 *   - resource_type from route path
 *   - action from HTTP method (GET=view, POST=create, PUT=update, DELETE=delete)
 */

const METHOD_ACTION_MAP: Record<string, string> = {
  GET: 'view',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

/**
 * Extract patient_id from URL params (e.g. /api/patient/123 or /api/patient-cards/456)
 */
function extractPatientId(req: Request): number | null {
  // Check route params
  if (req.params?.patientId) return parseInt(req.params.patientId) || null;
  if (req.params?.id) return parseInt(req.params.id) || null;

  // Try to extract from URL path segments (e.g. /api/patient/42/appointments)
  const segments = req.path.split('/').filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    if ((segments[i] === 'patient' || segments[i] === 'patients') && segments[i + 1]) {
      const num = parseInt(segments[i + 1]);
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

/**
 * Extract resource_type from the base route path.
 */
function extractResourceType(req: Request): string {
  const path = req.baseUrl || req.path;
  // /api/patient/xxx -> patient
  // /api/consent-forms/xxx -> consent-forms
  const match = path.match(/^\/api\/([^/]+)/);
  return match ? match[1] : 'unknown';
}

/**
 * Extract resource_id from URL params.
 */
function extractResourceId(req: Request): string | null {
  if (req.params?.id) return String(req.params.id);
  // Attempt to pull last numeric segment
  const segments = req.path.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(segments[i])) return segments[i];
  }
  return null;
}

export function hipaaAccessLog() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Fire-and-forget audit log - do not await, never block
    setImmediate(() => {
      try {
        const actor = (req as any).actor;
        const userId = actor?.id ?? actor?.userId ?? 0;
        const userEmail = actor?.email || (req.headers['x-actor-email'] as string) || '';
        const customerId = actor?.customer_id ?? null;
        const patientId = extractPatientId(req);
        const resourceType = extractResourceType(req);
        const resourceId = extractResourceId(req);
        const action = METHOD_ACTION_MAP[req.method] || 'view';
        const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
        const userAgent = (req.headers['user-agent'] || '').slice(0, 500);
        const sessionId = (req.headers['x-session-id'] as string) || null;

        // The insert must run under runAsSystem. setImmediate defers this past
        // the request, so it executes outside the AsyncLocalStorage tenant
        // context, which leaves SESSION_CONTEXT('customer_id') unset - and the
        // tenant security policy's block predicate then rejects every audit
        // write, including a cross-tenant actor's NULL customer_id. The audit
        // trail silently did not exist. An audit write is a system write and
        // must never be subject to the tenant policy; require-role.ts already
        // wraps its own audit writes the same way.
        const pool = Database.getInstance().getPool();
        runAsSystem(() => pool.request()
          .input('user_id', sql.Int, userId)
          .input('user_email', sql.NVarChar, userEmail)
          .input('patient_id', sql.Int, patientId)
          .input('resource_type', sql.NVarChar, resourceType)
          .input('resource_id', sql.NVarChar, resourceId)
          .input('action', sql.NVarChar, action)
          .input('ip_address', sql.NVarChar, ipAddress)
          .input('user_agent', sql.NVarChar, userAgent)
          .input('session_id', sql.NVarChar, sessionId)
          .input('customer_id', sql.Int, customerId)
          .query(`
            INSERT INTO dbo.HipaaAccessLog
              (user_id, user_email, patient_id, resource_type, resource_id,
               action, ip_address, user_agent, session_id, customer_id)
            VALUES
              (@user_id, @user_email, @patient_id, @resource_type, @resource_id,
               @action, @ip_address, @user_agent, @session_id, @customer_id)
          `)
          .catch((err: any) => {
            // A lost audit row is a compliance failure (HIPAA 164.312(b)), not a
            // cosmetic one, so it carries an alert key rather than only a log line.
            logger.error('[HIPAA-LOG] Failed to write access log', {
              err: err?.message || String(err),
              userEmail, resourceType, resourceId, action,
              alert: 'HIPAA_AUDIT_WRITE_FAILED',
            });
          }));
      } catch (err: any) {
        logger.error(`[HIPAA-LOG] Error preparing access log: ${err?.message || err}`);
      }
    });

    next();
  };
}
