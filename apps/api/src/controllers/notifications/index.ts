import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { pushNotification } from '../../websockets/index';

export class NotificationsController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /** GET /api/notifications?userId=X - list notifications for a user */
  public list = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = parseInt(req.query['userId'] as string);
      if (!userId) return res.status(400).json({ message: 'userId is required' });

      const result = await this.pool.request()
        .input('userId', sql.Int, userId)
        .query(`
          SELECT TOP 50 id, user_id, type, title, message, link, is_read, created_at
          FROM dbo.Notifications
          WHERE user_id = @userId
          ORDER BY created_at DESC
        `);

      const notifications = result.recordset.map((n: any) => ({
        id: n.id,
        userId: n.user_id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        isRead: !!n.is_read,
        createdAt: n.created_at,
      }));

      return res.json({ data: notifications });
    } catch (error: unknown) {
      logger.error('Notifications.list error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/notifications/unread-count?userId=X */
  public unreadCount = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = parseInt(req.query['userId'] as string);
      if (!userId) return res.status(400).json({ message: 'userId is required' });

      const result = await this.pool.request()
        .input('userId', sql.Int, userId)
        .query(`SELECT COUNT(*) AS cnt FROM dbo.Notifications WHERE user_id = @userId AND is_read = 0`);

      return res.json({ count: result.recordset[0].cnt });
    } catch (error: unknown) {
      logger.error('Notifications.unreadCount error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/notifications/:id/read - mark single notification as read */
  public markRead = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      await this.pool.request()
        .input('id', sql.Int, parseInt(id))
        .query(`UPDATE dbo.Notifications SET is_read = 1 WHERE id = @id`);

      return res.json({ message: 'Marked as read' });
    } catch (error: unknown) {
      logger.error('Notifications.markRead error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/notifications/read-all?userId=X - mark all as read */
  public markAllRead = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = parseInt(req.query['userId'] as string);
      if (!userId) return res.status(400).json({ message: 'userId is required' });

      await this.pool.request()
        .input('userId', sql.Int, userId)
        .query(`UPDATE dbo.Notifications SET is_read = 1 WHERE user_id = @userId AND is_read = 0`);

      return res.json({ message: 'All marked as read' });
    } catch (error: unknown) {
      logger.error('Notifications.markAllRead error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * Utility: create a notification and push via WebSocket.
   * Call from other controllers (e.g., after assignment, escalation, etc.)
   */
  public static async create(
    pool: sql.ConnectionPool,
    userId: number,
    type: string,
    title: string,
    message?: string,
    link?: string,
  ): Promise<void> {
    try {
      const result = await pool.request()
        .input('userId', sql.Int, userId)
        .input('type', sql.NVarChar(50), type)
        .input('title', sql.NVarChar(255), title)
        .input('message', sql.NVarChar(sql.MAX), message || null)
        .input('link', sql.NVarChar(500), link || null)
        .query(`
          INSERT INTO dbo.Notifications (user_id, type, title, message, link, is_read, created_at)
          OUTPUT INSERTED.id, INSERTED.created_at
          VALUES (@userId, @type, @title, @message, @link, 0, GETDATE())
        `);

      const row = result.recordset[0];
      pushNotification(userId, {
        id: row.id,
        userId,
        type,
        title,
        message,
        link,
        isRead: false,
        createdAt: row.created_at,
      });
    } catch (error) {
      logger.error('Notifications.create error', { error });
    }
  }
}
