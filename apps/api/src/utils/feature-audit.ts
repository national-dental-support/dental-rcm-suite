import sql from 'mssql';
import { ConnectionPool } from 'mssql';
import logger from './logger';

export interface FeatureAuditPayload {
  feature: string;
  action: string;
  actorId?: number | null;
  actorEmail?: string | null;
  targetId?: string | null;
  targetType?: string | null;
  details?: Record<string, unknown> | string | null;
  ip?: string | null;
}

/**
 * Writes a structured audit entry to FeatureAuditLog.
 *
 * Fire-and-forget: errors are logged as warnings but never thrown,
 * so they never interrupt the primary request/response cycle.
 */
export async function logFeatureAction(pool: ConnectionPool, payload: FeatureAuditPayload): Promise<void> {
  try {
    const detailsStr =
      payload.details == null
        ? null
        : typeof payload.details === 'string'
          ? payload.details
          : JSON.stringify(payload.details);

    await pool
      .request()
      .input('feature',     sql.NVarChar(50),       payload.feature)
      .input('action',      sql.NVarChar(100),      payload.action)
      .input('actor_id',    sql.Int,                payload.actorId ?? null)
      .input('actor_email', sql.NVarChar(200),      payload.actorEmail ?? null)
      .input('target_id',   sql.NVarChar(100),      payload.targetId ?? null)
      .input('target_type', sql.NVarChar(50),       payload.targetType ?? null)
      .input('details',     sql.NVarChar(sql.MAX),  detailsStr)
      .input('ip_address',  sql.NVarChar(50),       payload.ip ?? null)
      .query(`
        INSERT INTO FeatureAuditLog
          (feature, action, actor_id, actor_email, target_id, target_type, details, ip_address)
        VALUES
          (@feature, @action, @actor_id, @actor_email, @target_id, @target_type, @details, @ip_address)
      `);
  } catch (err) {
    logger.warn(`logFeatureAction failed (feature=${payload.feature}, action=${payload.action}): ${err}`);
  }
}
