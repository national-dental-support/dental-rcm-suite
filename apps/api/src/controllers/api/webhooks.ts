import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

/*
  DDL for reference. The schema is created by db/migrations - see 904_deferred_schema.sql.

  CREATE TABLE WebhookSubscription (
    id INT IDENTITY(1,1) PRIMARY KEY,
    customer_id INT NOT NULL,
    event_type NVARCHAR(100) NOT NULL,     -- 'claim.denied' | 'claim.resolved' | 'training.completed' | '*'
    target_url NVARCHAR(500) NOT NULL,
    secret NVARCHAR(200),
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETDATE()
  );

  CREATE TABLE WebhookDelivery (
    id INT IDENTITY(1,1) PRIMARY KEY,
    subscription_id INT NOT NULL REFERENCES WebhookSubscription(id),
    event_type NVARCHAR(100) NOT NULL,
    payload NVARCHAR(MAX),
    response_status INT,
    response_body NVARCHAR(MAX),
    status NVARCHAR(20) DEFAULT 'pending',  -- 'pending' | 'delivered' | 'failed'
    attempts INT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE()
  );
*/

export class WebhooksController extends DatabaseConnectionController {
  constructor() { super(); }

  listSubscriptions = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const customerId = (req as any).actor?.customer_id as number | undefined;
      if (!customerId) return res.status(403).json({ message: 'Forbidden: tenant context required.' });
      const result = await pool.request()
        .input('CustId', sql.Int, customerId)
        .query(`
          SELECT id, customer_id AS customerId, event_type AS eventType,
                 target_url AS targetUrl, is_active AS isActive,
                 created_at AS createdAt
          FROM dbo.WebhookSubscription WHERE customer_id = @CustId ORDER BY event_type
        `);
      res.json(result.recordset);
    } catch (err: any) {
      logger.error('webhooks list error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  createSubscription = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const customerId = (req as any).actor?.customer_id as number | undefined;
      if (!customerId) return res.status(403).json({ message: 'Forbidden: tenant context required.' });
      const { eventType, targetUrl, secret } = req.body;
      const result = await pool.request()
        .input('CustId', sql.Int, customerId)
        .input('Event', sql.NVarChar(100), eventType)
        .input('Url', sql.NVarChar(500), targetUrl)
        .input('Secret', sql.NVarChar(200), secret || null)
        .query(`
          INSERT INTO dbo.WebhookSubscription (customer_id, event_type, target_url, secret)
          VALUES (@CustId, @Event, @Url, @Secret);
          SELECT SCOPE_IDENTITY() AS id;
        `);
      res.json({ id: result.recordset[0].id });
    } catch (err: any) {
      logger.error('webhooks create error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  deleteSubscription = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const id = parseInt(req.params.id);
      const customerId = (req as any).actor?.customer_id as number | undefined;
      if (!customerId) return res.status(403).json({ message: 'Forbidden: tenant context required.' });
      await pool.request()
        .input('Id', sql.Int, id)
        .input('CustId', sql.Int, customerId)
        .query(`DELETE FROM dbo.WebhookSubscription WHERE id = @Id AND customer_id = @CustId`);
      res.json({ success: true });
    } catch (err: any) {
      logger.error('webhooks delete error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  getDeliveries = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const subId = parseInt(req.params.id);
      const result = await pool.request().input('SubId', sql.Int, subId).query(`
        SELECT TOP 50 id, event_type AS eventType, status,
               response_status AS responseStatus, attempts,
               created_at AS createdAt
        FROM dbo.WebhookDelivery
        WHERE subscription_id = @SubId ORDER BY created_at DESC
      `);
      res.json(result.recordset);
    } catch (err: any) {
      logger.error('webhooks deliveries error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  getEventTypes = async (_req: Request, res: Response) => {
    res.json([
      { event: 'claim.denied', description: 'Fired when a claim is denied' },
      { event: 'claim.resolved', description: 'Fired when a claim is resolved/closed' },
      { event: 'claim.escalated', description: 'Fired when a claim is escalated' },
      { event: 'claim.assigned', description: 'Fired when a claim is assigned' },
      { event: 'training.completed', description: 'Fired when a training module is completed' },
      { event: 'training.quiz-passed', description: 'Fired when a quiz is passed' },
      { event: '*', description: 'Subscribe to all events' },
    ]);
  };
}
