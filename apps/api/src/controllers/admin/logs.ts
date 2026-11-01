import { Request, Response } from 'express';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

export class AdminLogsController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * GET /api/admin/logs/events?limit=500
   * Returns recent analytics events from AnalyticsEvents, newest first.
   */
  public getEvents = async (req: Request, res: Response): Promise<Response> => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
    try {
      const result = await this.pool.request().query(`
        SELECT TOP ${limit}
          id, session_id, user_id, url, timestamp, event_name, properties, created_at
        FROM AnalyticsEvents
        ORDER BY timestamp DESC
      `);
      logger.info(`AdminLogs.getEvents \u2192 ${result.recordset.length} rows`);
      return res.status(200).json({ data: /* istanbul ignore next */ result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('AdminLogs.getEvents \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };

  /**
   * GET /api/admin/logs/errors?limit=500
   * Returns recent analytics errors from AnalyticsErrors, newest first.
   */
  public getErrors = async (req: Request, res: Response): Promise<Response> => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
    try {
      const result = await this.pool.request().query(`
        SELECT TOP ${limit}
          id, session_id, user_id, url, timestamp,
          error_type, message, stack, http_status, http_method, http_url, created_at
        FROM AnalyticsErrors
        ORDER BY timestamp DESC
      `);
      logger.info(`AdminLogs.getErrors \u2192 ${result.recordset.length} rows`);
      return res.status(200).json({ data: /* istanbul ignore next */ result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('AdminLogs.getErrors \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
