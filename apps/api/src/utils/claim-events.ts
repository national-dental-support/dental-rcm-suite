import sql from 'mssql';
import logger from './logger';

export interface ClaimEventMetadata {
  [key: string]: any;
}

export async function recordClaimEvent(
  pool: sql.ConnectionPool,
  opts: {
    customerId?: number | null;
    claimId: string;
    eventType: string;
    actorUser?: string | null;
    metadata?: ClaimEventMetadata | null;
    eventTime?: Date;
  },
): Promise<void> {
  try {
    const { customerId, claimId, eventType, actorUser, metadata, eventTime } = opts;
    const req = pool.request();
    req.input('claimId', sql.NVarChar(50), claimId);
    req.input('eventType', sql.NVarChar(50), eventType);
    req.input('actorUser', sql.NVarChar(255), actorUser ?? null);
    req.input('metadata', sql.NVarChar(sql.MAX), metadata ? JSON.stringify(metadata) : null);
    req.input('eventTime', sql.DateTime2, eventTime ?? new Date());
    req.input('customerId', sql.Int, customerId ?? null);

    await req.query(`
      INSERT INTO dbo.ClaimEvent (customer_id, claim_id, event_type, event_time, actor_user, metadata)
      VALUES (@customerId, @claimId, @eventType, @eventTime, @actorUser, @metadata);
    `);
  } catch (err: unknown) {
    // Telemetry should never block core workflows.
    logger.warn('recordClaimEvent failed', { error: err, claimId: opts.claimId, eventType: opts.eventType });
  }
}

export interface ClaimEventQueryOptions {
  claimId?: string;
  eventType?: string;
  from?: string; // ISO date
  to?: string;   // ISO date
  customerId?: number | null;
}

export async function queryClaimEvents(
  pool: sql.ConnectionPool,
  opts: ClaimEventQueryOptions,
): Promise<any[]> {
  const { claimId, eventType, from, to, customerId } = opts;
  const where: string[] = [];
  const req = pool.request();
  if (customerId != null) {
    req.input('customerId', sql.Int, customerId);
    where.push('(customer_id = @customerId OR customer_id IS NULL)');
  }
  if (claimId) {
    req.input('claimId', sql.NVarChar(50), claimId);
    where.push('claim_id = @claimId');
  }
  if (eventType) {
    req.input('eventType', sql.NVarChar(50), eventType);
    where.push('event_type = @eventType');
  }
  if (from) {
    req.input('from', sql.DateTime2, new Date(from));
    where.push('event_time >= @from');
  }
  if (to) {
    req.input('to', sql.DateTime2, new Date(to));
    where.push('event_time <= @to');
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await req.query(`
    SELECT id, customer_id, claim_id, event_type, event_time, actor_user, metadata, created_at
    FROM dbo.ClaimEvent
    ${whereClause}
    ORDER BY event_time DESC, id DESC
  `);
  return result.recordset;
}
