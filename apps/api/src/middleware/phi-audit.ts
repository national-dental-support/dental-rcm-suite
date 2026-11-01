import { Request, Response, NextFunction } from 'express';
import Database from '../modules/db';
import { writeAuditLog } from '../utils/audit-log';

/**
 * Middleware that logs PHI (Protected Health Information) access to AdminAuditLog.
 * Applied to routes that return patient-identifiable data (claim detail, patient records).
 * HIPAA requires logging who accessed what PHI and when.
 */
export function phiAudit(action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const actorEmail = req.headers['x-actor-email'] as string || 'unknown';
    const claimId = (req.query.claimId as string) || (req.body?.claimId as string) || req.params.id || '';

    // Fire-and-forget audit log - don't block the request
    const pool = Database.getInstance().getPool();
    writeAuditLog(pool, {
      actor_id: actorEmail,
      actor_role: (req as any).actor?.role || 'unknown',
      action,
      target_id: claimId,
      after_state: {
        method: req.method,
        path: req.path,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      },
      ip_address: req.ip,
      session_id: req.headers['x-session-id'] as string ?? undefined,
    });

    next();
  };
}
