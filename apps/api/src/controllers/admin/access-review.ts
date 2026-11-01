import { Request, Response } from 'express';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

export class AccessReviewController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * GET /api/admin/access-review
   * Returns all users with role, last login, account status, and created date
   * for use in periodic access reviews (SOC2 CC6.3 / HIPAA Sec.164.312).
   */
  public list = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const result = await this.pool.request().query(`
        SELECT
          u.Email           AS email,
          u.FirstName       AS first_name,
          u.LastName        AS last_name,
          u.Role            AS role,
          u.disabled        AS disabled,
          u.archived        AS archived,
          u.last_login_at   AS last_login_at,
          -- Who created this user? Latest audit log entry with action=user.create
          (
            SELECT TOP 1 actor_id
            FROM AdminAuditLog
            WHERE target_id = u.Email AND action = 'user.create'
            ORDER BY timestamp ASC
          ) AS created_by
        FROM Users u
        WHERE u.archived = 0 OR u.archived IS NULL
        ORDER BY u.LastName ASC, u.FirstName ASC
      `);

      logger.info(`AccessReview.list \u2192 ${result.recordset?.length ?? 0} users`);
      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('AccessReview.list \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
