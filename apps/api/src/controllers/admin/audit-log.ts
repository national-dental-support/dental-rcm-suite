import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

export class AuditLogController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * GET /api/admin/audit-log
   * Query params:
   *   actor     - filter by actor_id (partial, case-insensitive)
   *   target    - filter by target_id (partial, case-insensitive)
   *   action    - filter by exact action (e.g. 'user.create')
   *   from      - ISO date string, start of range
   *   to        - ISO date string, end of range
   *   limit     - max rows (default 500, max 2000)
   */
  public list = async (req: Request, res: Response): Promise<Response> => {
    const limit  = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
    const actor  = (req.query.actor  as string) ?? null;
    const target = (req.query.target as string) ?? null;
    const action = (req.query.action as string) ?? null;
    const from   = (req.query.from   as string) ?? null;
    const to     = (req.query.to     as string) ?? null;

    try {
      const request = this.pool.request();

      const conditions: string[] = [];

      if (actor) {
        request.input('actor', sql.NVarChar(255), `%${actor}%`);
        conditions.push('actor_id LIKE @actor');
      }
      if (target) {
        request.input('target', sql.NVarChar(255), `%${target}%`);
        conditions.push('target_id LIKE @target');
      }
      if (action) {
        request.input('action', sql.NVarChar(100), action);
        conditions.push('action = @action');
      }
      if (from) {
        request.input('from', sql.DateTime2, new Date(from));
        conditions.push('timestamp >= @from');
      }
      if (to) {
        request.input('to', sql.DateTime2, new Date(to));
        conditions.push('timestamp <= @to');
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await request.query(`
        SELECT TOP ${limit}
          id, actor_id, actor_role, action, target_id,
          before_state, after_state, ip_address, session_id,
          timestamp, created_at
        FROM AdminAuditLog
        ${where}
        ORDER BY timestamp DESC
      `);

      logger.info(`AuditLog.list \u2192 ${result.recordset?.length ?? 0} rows`);
      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('AuditLog.list \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
