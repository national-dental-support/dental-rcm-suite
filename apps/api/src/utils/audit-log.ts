import sql from 'mssql';
import { ConnectionPool } from 'mssql';
import logger from './logger';

export interface AuditLogPayload {
  actor_id: string;       // email of the admin performing the action
  actor_role: string;     // role at time of action
  action: string;         // e.g. 'user.create' | 'claim.close' | 'phi.view'
  target_id?: string;     // email/identifier of the affected resource
  before_state?: object | null;   // snapshot before change
  after_state?: object | null;    // snapshot after change
  ip_address?: string;
  session_id?: string;
  entity_type?: string;   // e.g. 'Claim' | 'User' | 'Appeal'
  phi_fields?: string[];  // names of PHI fields accessed (never their values)
  user_agent?: string;
  // HIPAA/SOC2 required traceability fields
  cause?: string;         // why the action was taken (e.g. 'User submitted appeal form')
  outcome?: 'success' | 'failure';  // result of the action
  duration_ms?: number;   // wall-clock time for the operation
}

/**
 * Writes a row to AdminAuditLog.
 * Fire-and-forget safe: errors are logged but never thrown so they don't
 * interrupt the primary request/response cycle.
 */
export async function writeAuditLog(pool: ConnectionPool, payload: AuditLogPayload): Promise<void> {
  try {
    await pool
      .request()
      .input('actor_id',     sql.NVarChar(255),      payload.actor_id)
      .input('actor_role',   sql.NVarChar(50),        payload.actor_role)
      .input('action',       sql.NVarChar(100),       payload.action)
      .input('target_id',    sql.NVarChar(255),       payload.target_id    ?? null)
      .input('before_state', sql.NVarChar(sql.MAX),   payload.before_state ? JSON.stringify(payload.before_state) : null)
      .input('after_state',  sql.NVarChar(sql.MAX),   payload.after_state  ? JSON.stringify(payload.after_state)  : null)
      .input('ip_address',   sql.NVarChar(45),        payload.ip_address   ?? null)
      .input('session_id',   sql.NVarChar(100),       payload.session_id   ?? null)
      .input('entity_type',  sql.NVarChar(50),        payload.entity_type  ?? null)
      .input('phi_fields',   sql.NVarChar(sql.MAX),   payload.phi_fields   ? JSON.stringify(payload.phi_fields) : null)
      .input('user_agent',   sql.NVarChar(500),       payload.user_agent   ?? null)
      .input('cause',        sql.NVarChar(500),       payload.cause        ?? null)
      .input('outcome',      sql.NVarChar(20),        payload.outcome      ?? 'success')
      .input('duration_ms',  sql.Int,                 payload.duration_ms  ?? null)
      .query(`
        INSERT INTO dbo.AdminAuditLog
          (actor_id, actor_role, action, target_id, before_state, after_state,
           ip_address, session_id, entity_type, phi_fields, user_agent,
           cause, outcome, duration_ms)
        VALUES
          (@actor_id, @actor_role, @action, @target_id, @before_state, @after_state,
           @ip_address, @session_id, @entity_type, @phi_fields, @user_agent,
           @cause, @outcome, @duration_ms)
      `);
    logger.info(`AuditLog [${payload.outcome ?? 'success'}]: ${payload.actor_id} \u2192 ${payload.action} on ${payload.target_id ?? 'N/A'}`);
  } catch (err) {
    logger.error(`writeAuditLog failed (action=${payload.action}): ${err}`);
  }
}
