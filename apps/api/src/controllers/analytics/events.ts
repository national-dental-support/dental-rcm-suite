import { Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import logger from '../../utils/logger';

const db = Database.getInstance();

function isValidEventPayload(body: unknown): body is {
  sessionId: string;
  userId: string;
  url: string;
  timestamp: string;
  eventName: string;
  properties?: Record<string, unknown>;
} {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as any).sessionId === 'string' &&
    typeof (body as any).userId === 'string' &&
    typeof (body as any).url === 'string' &&
    typeof (body as any).timestamp === 'string' &&
    typeof (body as any).eventName === 'string'
  );
}

function isValidErrorPayload(body: unknown): body is {
  sessionId: string;
  userId: string;
  url?: string;
  timestamp?: string;
  errorType: string;
  message: string;
  stack?: string;
  httpStatus?: number;
  httpMethod?: string;
  httpUrl?: string;
} {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as any).errorType === 'string' &&
    typeof (body as any).message === 'string'
  );
}

export const analyticsEventsController = {
  async trackEvent(req: Request, res: Response): Promise<void> {
    // Respond 204 immediately - fire-and-forget from the client's perspective
    res.status(204).end();

    if (!isValidEventPayload(req.body)) return;

    const { sessionId, userId, url, timestamp, eventName, properties } = req.body;

    logger.info(
      `[analytics:event] ${eventName} | user=${userId} | session=${sessionId} | url=${url} | props=${JSON.stringify(properties ?? {})}`
    );

    try {
      await db.getPool()
        .request()
        .input('session_id',  sql.NVarChar(100),      sessionId)
        .input('user_id',     sql.NVarChar(255),      userId)
        .input('url',         sql.NVarChar(1000),     url)
        .input('timestamp',   sql.DateTime2,          new Date(timestamp))
        .input('event_name',  sql.NVarChar(100),      eventName)
        .input('properties',  sql.NVarChar(sql.MAX),  JSON.stringify(properties ?? {}))
        .query(`
          INSERT INTO AnalyticsEvents
            (session_id, user_id, url, timestamp, event_name, properties)
          VALUES
            (@session_id, @user_id, @url, @timestamp, @event_name, @properties)
        `);
    } catch (err) {
      logger.error(`[analytics:event] DB write failed: ${(err as Error).message}`);
    }
  },

  async trackError(req: Request, res: Response): Promise<void> {
    res.status(204).end();

    if (!isValidErrorPayload(req.body)) return;

    const {
      sessionId = '',
      userId = '',
      url = '',
      timestamp,
      errorType,
      message,
      stack,
      httpStatus,
      httpMethod,
      httpUrl,
    } = req.body;

    logger.error(
      `[analytics:error] ${errorType} | user=${userId} | session=${sessionId} | msg=${message}`
    );

    try {
      await db.getPool()
        .request()
        .input('session_id',  sql.NVarChar(100),      sessionId)
        .input('user_id',     sql.NVarChar(255),      userId)
        .input('url',         sql.NVarChar(1000),     url)
        .input('timestamp',   sql.DateTime2,          new Date(timestamp ?? Date.now()))
        .input('error_type',  sql.NVarChar(50),       errorType)
        .input('message',     sql.NVarChar(sql.MAX),  message)
        .input('stack',       sql.NVarChar(sql.MAX),  stack ?? null)
        .input('http_status', sql.Int,                httpStatus ?? null)
        .input('http_method', sql.NVarChar(10),       httpMethod ?? null)
        .input('http_url',    sql.NVarChar(1000),     httpUrl ?? null)
        .query(`
          INSERT INTO AnalyticsErrors
            (session_id, user_id, url, timestamp, error_type, message, stack,
             http_status, http_method, http_url)
          VALUES
            (@session_id, @user_id, @url, @timestamp, @error_type, @message, @stack,
             @http_status, @http_method, @http_url)
        `);
    } catch (err) {
      logger.error(`[analytics:error] DB write failed: ${(err as Error).message}`);
    }
  },
};
