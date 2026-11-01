import sql from 'mssql';
import { ConnectionPool } from 'mssql';
import logger from './logger';

export interface TelemetryPayload {
  event: string;
  feature: string;
  actorId?: number | null;
  customerId?: number | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Writes a telemetry event to TelemetryEvent table.
 *
 * Fire-and-forget: errors are logged as warnings but never thrown,
 * so they never interrupt the primary request/response cycle.
 */
export async function trackEvent(pool: ConnectionPool, payload: TelemetryPayload): Promise<void> {
  try {
    const metadataStr = payload.metadata ? JSON.stringify(payload.metadata) : null;

    await pool
      .request()
      .input('event_name',  sql.NVarChar(100),      payload.event)
      .input('feature',     sql.NVarChar(50),       payload.feature)
      .input('actor_id',    sql.Int,                payload.actorId ?? null)
      .input('customer_id', sql.Int,                payload.customerId ?? null)
      .input('metadata',    sql.NVarChar(sql.MAX),  metadataStr)
      .query(`
        INSERT INTO TelemetryEvent
          (event_name, feature, actor_id, customer_id, metadata)
        VALUES
          (@event_name, @feature, @actor_id, @customer_id, @metadata)
      `);
  } catch (err) {
    logger.warn(`trackEvent failed (event=${payload.event}, feature=${payload.feature}): ${err}`);
  }
}
