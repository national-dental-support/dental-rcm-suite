import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

/**
 * Compliance Dashboard - HIPAA audit readiness.
 * Aggregates training completion, access reviews, failed logins,
 * unusual access patterns, and data export audit trail.
 */

export class ComplianceController extends DatabaseConnectionController {
  constructor() { super(); }

  getDashboard = async (_req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;

      const [trainingResult, loginsResult, auditResult, usersResult] = await Promise.all([
        // Training compliance (completed vs total assignments)
        pool.request().query(`
          SELECT COUNT(*) AS total,
                 SUM(CASE WHEN umc.id IS NOT NULL THEN 1 ELSE 0 END) AS completed,
                 SUM(CASE WHEN ta.due_date < GETDATE() AND umc.id IS NULL THEN 1 ELSE 0 END) AS overdue
          FROM dbo.TrainingAssignment ta
          LEFT JOIN dbo.UserModuleCompletion umc
            ON umc.user_email = ta.assigned_to_email AND umc.module_id = ta.module_id
        `),
        // Failed logins last 30 days
        pool.request().query(`
          SELECT COUNT(*) AS failedLogins,
                 COUNT(DISTINCT actor_id) AS uniqueUsers
          FROM dbo.AdminAuditLog
          WHERE action = 'login_failed' AND created_at >= DATEADD(DAY, -30, GETDATE())
        `),
        // Audit log activity last 30 days
        pool.request().query(`
          SELECT action, COUNT(*) AS cnt
          FROM dbo.AdminAuditLog
          WHERE created_at >= DATEADD(DAY, -30, GETDATE())
          GROUP BY action ORDER BY cnt DESC
        `),
        // User account status
        pool.request().query(`
          SELECT COUNT(*) AS totalUsers,
                 SUM(CASE WHEN disabled = 1 THEN 1 ELSE 0 END) AS disabledUsers,
                 SUM(CASE WHEN locked_until > GETDATE() THEN 1 ELSE 0 END) AS lockedUsers,
                 SUM(CASE WHEN last_login_at < DATEADD(DAY, -90, GETDATE()) OR last_login_at IS NULL THEN 1 ELSE 0 END) AS dormantUsers
          FROM dbo.Users WHERE archived = 0
        `),
      ]);

      const training = trainingResult.recordset[0];
      const logins = loginsResult.recordset[0];
      const users = usersResult.recordset[0];

      res.json({
        training: {
          total: training.total,
          completed: training.completed,
          overdue: training.overdue,
          complianceRate: training.total > 0
            ? Math.round((training.completed / training.total) * 100)
            : 100,
        },
        security: {
          failedLogins30d: logins.failedLogins,
          uniqueFailedUsers: logins.uniqueUsers,
          lockedAccounts: users.lockedUsers,
          dormantAccounts: users.dormantUsers,
        },
        users: {
          total: users.totalUsers,
          disabled: users.disabledUsers,
          locked: users.lockedUsers,
          dormant: users.dormantUsers,
        },
        auditActivity: auditResult.recordset,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('compliance dashboard error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  getAccessReviewStatus = async (_req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const result = await pool.request().query(`
        SELECT u.userID AS uid, u.FirstName + ' ' + u.LastName AS name,
               u.Email, u.Role, u.last_login_at AS lastLogin,
               u.disabled, u.archived,
               (SELECT COUNT(*) FROM dbo.AdminAuditLog
                WHERE actor_id = CAST(u.userID AS NVARCHAR) AND created_at >= DATEADD(DAY, -30, GETDATE())
               ) AS activityCount30d
        FROM dbo.Users u
        WHERE u.archived = 0
        ORDER BY u.last_login_at ASC
      `);
      res.json(result.recordset);
    } catch (err: any) {
      logger.error('compliance access-review error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
