import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class ReconAlertsController extends DatabaseConnectionController {
  constructor() { super(); }

  listAlerts = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req);
      const { type, severity, status = 'open' } = req.query as Record<string, string>;
      const page     = Math.max(parseInt(String(req.query.page))     || 1, 1);
      const pageSize = Math.min(parseInt(String(req.query.pageSize)) || 25, 100);
      const offset   = (page - 1) * pageSize;

      const conditions: string[] = [`a.status = @Status`];
      if (xenCustId != null) conditions.push('a.customer_id = @CustId');
      if (type)     conditions.push('a.alert_type = @Type');
      if (severity) conditions.push('c.severity = @Severity');

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const r = this.pool.request();
      r.input('Status',   sql.NVarChar(20), status);
      if (xenCustId != null) r.input('CustId',   sql.Int, xenCustId);
      if (type)     r.input('Type',     sql.NVarChar(50), type);
      if (severity) r.input('Severity', sql.NVarChar(10), severity);
      r.input('Offset',   sql.Int, offset);
      r.input('PageSize', sql.Int, pageSize);

      const result = await r.query(`
        SELECT a.id, a.alert_type, a.item_id, a.item_date, a.days_aged,
               a.status, a.acknowledged_by, a.created_at,
               c.severity, c.threshold_days
        FROM dbo.ReconAlert a
        JOIN dbo.ReconAlertConfig c ON c.id = a.config_id
        ${where}
        ORDER BY c.severity DESC, a.days_aged DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `);

      res.json({
        rows: result.recordset.map((row: any) => ({
          id:             row.id,
          alertType:      row.alert_type,
          itemId:         row.item_id,
          itemDate:       row.item_date,
          daysAged:       row.days_aged,
          status:         row.status,
          acknowledgedBy: row.acknowledged_by,
          createdAt:      row.created_at,
          severity:       row.severity,
          thresholdDays:  row.threshold_days,
        })),
      });
    } catch (err: any) {
      logger.error('[ReconAlerts] listAlerts error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  acknowledge = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const actor = (req as any).user?.username ?? (req.headers['x-actor-email'] as string) ?? 'system';
      await this.pool.request()
        .input('Id',    sql.Int,           parseInt(id))
        .input('Actor', sql.NVarChar(100), actor)
        .query(`
          UPDATE dbo.ReconAlert
          SET status = 'acknowledged', acknowledged_by = @Actor
          WHERE id = @Id
        `);
      res.json({ message: 'Acknowledged' });
    } catch (err: any) {
      logger.error('[ReconAlerts] acknowledge error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  getConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req);
      const custSql = xenCustId != null ? 'WHERE customer_id = @CustId' : '';
      const r = this.pool.request();
      if (xenCustId != null) r.input('CustId', sql.Int, xenCustId);

      const result = await r.query(`
        SELECT id, alert_type, threshold_days, severity, is_enabled, notify_emails
        FROM dbo.ReconAlertConfig ${custSql}
        ORDER BY alert_type
      `);

      res.json({ configs: result.recordset.map((row: any) => ({
        id:            row.id,
        alertType:     row.alert_type,
        thresholdDays: row.threshold_days,
        severity:      row.severity,
        isEnabled:     row.is_enabled,
        notifyEmails:  row.notify_emails,
      })) });
    } catch (err: any) {
      logger.error('[ReconAlerts] getConfig error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  upsertConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req);
      const { alertType, thresholdDays, severity = 'warning', isEnabled = true, notifyEmails } = req.body as {
        alertType: string; thresholdDays: number; severity?: string; isEnabled?: boolean; notifyEmails?: string;
      };
      if (!alertType || thresholdDays == null) { res.status(400).json({ message: 'alertType and thresholdDays required' }); return; }

      const r = this.pool.request();
      r.input('CustId',    sql.Int,          xenCustId ?? 0);
      r.input('Type',      sql.NVarChar(50),  alertType);
      r.input('Days',      sql.Int,           thresholdDays);
      r.input('Severity',  sql.NVarChar(10),  severity);
      r.input('Enabled',   sql.Bit,           isEnabled ? 1 : 0);
      r.input('Emails',    sql.NVarChar(500), notifyEmails ?? null);

      await r.query(`
        MERGE dbo.ReconAlertConfig AS target
        USING (SELECT @CustId AS customer_id, @Type AS alert_type) AS src
          ON target.customer_id = src.customer_id AND target.alert_type = src.alert_type
        WHEN MATCHED THEN UPDATE SET
          threshold_days = @Days, severity = @Severity, is_enabled = @Enabled, notify_emails = @Emails
        WHEN NOT MATCHED THEN INSERT
          (customer_id, alert_type, threshold_days, severity, is_enabled, notify_emails)
          VALUES (@CustId, @Type, @Days, @Severity, @Enabled, @Emails);
      `);

      res.json({ message: 'Config saved' });
    } catch (err: any) {
      logger.error('[ReconAlerts] upsertConfig error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  deleteConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req);
      const id = parseInt(req.params['id'], 10);
      if (isNaN(id)) { res.status(400).json({ message: 'Invalid id' }); return; }

      const r = this.pool.request().input('Id', sql.Int, id);
      if (xenCustId != null) {
        r.input('CustId', sql.Int, xenCustId);
        await r.query('DELETE FROM dbo.ReconAlertConfig WHERE id = @Id AND customer_id = @CustId');
      } else {
        await r.query('DELETE FROM dbo.ReconAlertConfig WHERE id = @Id');
      }
      res.json({ message: 'Deleted' });
    } catch (err: any) {
      logger.error('[ReconAlerts] deleteConfig error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
