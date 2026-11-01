import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export interface ScheduledReport {
  id: number;
  name: string;
  reportType: string;        // 'denial-summary' | 'staff-performance' | 'ar-aging' | 'training-compliance' | 'executive-summary'
  frequency: string;         // 'daily' | 'weekly' | 'monthly'
  recipients: string;        // comma-separated email addresses
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdBy: string;
}

const REPORT_TYPES = ['denial-summary', 'staff-performance', 'ar-aging', 'training-compliance', 'executive-summary'];
const FREQUENCIES = ['daily', 'weekly', 'monthly'];

export class ScheduledReportsController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /** GET /insightflow/scheduled-reports - list all schedules */
  public list = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const xenCustId = extractCustomerId(_req);
      const custFilter = xenCustId != null ? 'WHERE customer_id = @_custId' : '';
      const lReq = this.pool.request();
      if (xenCustId != null) lReq.input('_custId', sql.Int, xenCustId);

      const result = await lReq.query(`
        SELECT id, name, report_type, frequency, recipients, is_active,
               last_run_at, next_run_at, created_by, created_at
        FROM dbo.ScheduledReports
        ${custFilter}
        ORDER BY name
      `);

      const reports = result.recordset.map((r: any) => ({
        id: r.id,
        name: r.name,
        reportType: r.report_type,
        frequency: r.frequency,
        recipients: r.recipients,
        isActive: !!r.is_active,
        lastRunAt: r.last_run_at,
        nextRunAt: r.next_run_at,
        createdBy: r.created_by,
        createdAt: r.created_at,
      }));

      return res.json({ message: 'Scheduled reports', data: reports });
    } catch (error: unknown) {
      logger.error('ScheduledReports.list error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /insightflow/scheduled-reports - create a new schedule */
  public create = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { name, reportType, frequency, recipients } = req.body;
      if (!name || !reportType || !frequency || !recipients) {
        return res.status(400).json({ message: 'name, reportType, frequency, and recipients are required' });
      }
      if (!REPORT_TYPES.includes(reportType)) {
        return res.status(400).json({ message: `Invalid reportType. Must be one of: ${REPORT_TYPES.join(', ')}` });
      }
      if (!FREQUENCIES.includes(frequency)) {
        return res.status(400).json({ message: `Invalid frequency. Must be one of: ${FREQUENCIES.join(', ')}` });
      }

      const nextRun = this.calculateNextRun(frequency);
      const createdBy = req.headers['x-actor-email'] as string || 'system';
      const xenCustId = extractCustomerId(req);

      const result = await this.pool.request()
        .input('name', sql.NVarChar(255), name)
        .input('reportType', sql.NVarChar(50), reportType)
        .input('frequency', sql.NVarChar(20), frequency)
        .input('recipients', sql.NVarChar(sql.MAX), recipients)
        .input('nextRun', sql.DateTime2, nextRun)
        .input('createdBy', sql.NVarChar(255), createdBy)
        .input('_custId', sql.Int, xenCustId ?? null)
        .query(`
          INSERT INTO dbo.ScheduledReports
            (name, report_type, frequency, recipients, is_active, next_run_at, created_by, created_at, customer_id)
          OUTPUT INSERTED.id
          VALUES (@name, @reportType, @frequency, @recipients, 1, @nextRun, @createdBy, GETDATE(), @_custId)
        `);

      return res.status(201).json({ message: 'Schedule created', data: { id: result.recordset[0].id } });
    } catch (error: unknown) {
      logger.error('ScheduledReports.create error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /insightflow/scheduled-reports/:id - update schedule */
  public update = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const { name, reportType, frequency, recipients, isActive } = req.body;
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null ? 'AND customer_id = @_custId' : '';

      const nextRun = this.calculateNextRun(frequency || 'daily');

      const uReq = this.pool.request()
        .input('id', sql.Int, parseInt(id))
        .input('name', sql.NVarChar(255), name)
        .input('reportType', sql.NVarChar(50), reportType)
        .input('frequency', sql.NVarChar(20), frequency)
        .input('recipients', sql.NVarChar(sql.MAX), recipients)
        .input('isActive', sql.Bit, isActive ? 1 : 0)
        .input('nextRun', sql.DateTime2, nextRun);
      if (xenCustId != null) uReq.input('_custId', sql.Int, xenCustId);

      await uReq.query(`
          UPDATE dbo.ScheduledReports
          SET name = @name, report_type = @reportType, frequency = @frequency,
              recipients = @recipients, is_active = @isActive, next_run_at = @nextRun
          WHERE id = @id ${custFilter}
        `);

      return res.json({ message: 'Schedule updated' });
    } catch (error: unknown) {
      logger.error('ScheduledReports.update error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /insightflow/scheduled-reports/:id */
  public delete = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null ? 'AND customer_id = @_custId' : '';

      const dReq = this.pool.request()
        .input('id', sql.Int, parseInt(id));
      if (xenCustId != null) dReq.input('_custId', sql.Int, xenCustId);

      await dReq.query(`DELETE FROM dbo.ScheduledReports WHERE id = @id ${custFilter}`);

      return res.json({ message: 'Schedule deleted' });
    } catch (error: unknown) {
      logger.error('ScheduledReports.delete error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /insightflow/scheduled-reports/:id/run - manually trigger a report */
  public runNow = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null ? 'AND customer_id = @_custId' : '';

      const findReq = this.pool.request()
        .input('id', sql.Int, parseInt(id));
      if (xenCustId != null) findReq.input('_custId', sql.Int, xenCustId);

      const result = await findReq.query(`SELECT * FROM dbo.ScheduledReports WHERE id = @id ${custFilter}`);

      if (!result.recordset[0]) {
        return res.status(404).json({ message: 'Schedule not found' });
      }

      const schedule = result.recordset[0];
      const reportData = await this.generateReportData(schedule.report_type, xenCustId);

      // Update last_run_at and next_run_at
      const nextRun = this.calculateNextRun(schedule.frequency);
      const upReq = this.pool.request()
        .input('id', sql.Int, parseInt(id))
        .input('nextRun', sql.DateTime2, nextRun);
      if (xenCustId != null) upReq.input('_custId', sql.Int, xenCustId);

      await upReq.query(`
          UPDATE dbo.ScheduledReports
          SET last_run_at = GETDATE(), next_run_at = @nextRun
          WHERE id = @id ${custFilter}
        `);

      // Send email
      const emailSent = await this.sendReportEmail(
        schedule.recipients,
        schedule.name,
        schedule.report_type,
        reportData,
      );

      logger.info('ScheduledReports.runNow', { id, reportType: schedule.report_type, emailSent });
      return res.json({
        message: emailSent ? 'Report sent' : 'Report generated (email delivery pending SMTP config)',
        data: reportData,
      });
    } catch (error: unknown) {
      logger.error('ScheduledReports.runNow error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** Generate report data based on type */
  public async generateReportData(reportType: string, xenCustId: number | null = null): Promise<any> {
    const custFilterRR = xenCustId != null ? 'AND r.customer_id = @_custId' : '';
    const custFilterCH = xenCustId != null ? 'AND ch.customer_id = @_custId' : '';
    const custFilterC  = xenCustId != null ? 'AND c.customer_id = @_custId' : '';
    const custFilterTA = xenCustId != null ? 'AND customer_id = @_custId' : '';
    const custWhereCH  = xenCustId != null ? 'AND customer_id = @_custId' : '';

    const addCust = (r: sql.Request) => {
      if (xenCustId != null) r.input('_custId', sql.Int, xenCustId);
      return r;
    };

    switch (reportType) {
      case 'denial-summary': {
        const result = await addCust(this.pool.request()).query(`
          SELECT
            COUNT(CASE WHEN r.IsClaimDenied = 1 THEN 1 END) AS DeniedClaims,
            SUM(CASE WHEN r.IsClaimDenied = 1 THEN r.TrxAmt ELSE 0 END) AS DeniedCharges,
            COUNT(*) AS TotalClaims
          FROM dbo.recon_report r
          WHERE r.TrxType = 'Charge' AND r.PostDate >= DATEADD(DAY, -30, GETDATE())
            ${custFilterRR}
        `);
        return { type: 'denial-summary', period: 'Last 30 days', ...result.recordset[0] };
      }
      case 'staff-performance': {
        const result = await addCust(this.pool.request()).query(`
          SELECT
            u.FirstName + ' ' + u.LastName AS SpecialistName,
            COUNT(*) AS ClaimsWorked,
            SUM(CASE WHEN ch.ClaimWorkEndedTime IS NOT NULL THEN 1 ELSE 0 END) AS ClaimsClosed
          FROM dbo.claimhistory ch
          JOIN dbo.Users u ON ch.AssignedTo = u.userID
          WHERE ch.ClaimModifiedDate >= DATEADD(DAY, -30, GETDATE())
            ${custFilterCH}
          GROUP BY u.FirstName, u.LastName
          ORDER BY ClaimsWorked DESC
        `);
        return { type: 'staff-performance', period: 'Last 30 days', specialists: result.recordset };
      }
      case 'ar-aging': {
        const result = await addCust(this.pool.request()).query(`
          SELECT
            CASE
              WHEN DATEDIFF(DAY, c.ClaimSubmittedDate, GETDATE()) <= 30 THEN '0-30'
              WHEN DATEDIFF(DAY, c.ClaimSubmittedDate, GETDATE()) <= 60 THEN '31-60'
              WHEN DATEDIFF(DAY, c.ClaimSubmittedDate, GETDATE()) <= 90 THEN '61-90'
              ELSE '90+'
            END AS Bucket,
            COUNT(*) AS ClaimCount,
            ISNULL(SUM(c.ChargeAmt), 0) AS TotalCharge
          FROM dbo.claims c
          WHERE c.ClaimSubmittedDate IS NOT NULL
            ${custFilterC}
          GROUP BY
            CASE
              WHEN DATEDIFF(DAY, c.ClaimSubmittedDate, GETDATE()) <= 30 THEN '0-30'
              WHEN DATEDIFF(DAY, c.ClaimSubmittedDate, GETDATE()) <= 60 THEN '31-60'
              WHEN DATEDIFF(DAY, c.ClaimSubmittedDate, GETDATE()) <= 90 THEN '61-90'
              ELSE '90+'
            END
          ORDER BY Bucket
        `);
        return { type: 'ar-aging', buckets: result.recordset };
      }
      case 'training-compliance': {
        const result = await addCust(this.pool.request()).query(`
          SELECT
            (SELECT COUNT(*) FROM dbo.TrainingAssignments WHERE 1=1 ${custFilterTA}) AS Total,
            (SELECT COUNT(*) FROM dbo.TrainingAssignments WHERE status = 'completed' ${custFilterTA}) AS Completed,
            (SELECT COUNT(*) FROM dbo.TrainingAssignments
             WHERE dueDate IS NOT NULL AND dueDate < GETDATE() AND status != 'completed' ${custFilterTA}) AS Overdue
        `);
        return { type: 'training-compliance', ...result.recordset[0] };
      }
      case 'executive-summary': {
        // Reuse executive summary logic
        const result = await addCust(this.pool.request()).query(`
          SELECT
            COUNT(CASE WHEN r.IsClaimDenied = 1 THEN 1 END) AS DeniedClaims,
            SUM(CASE WHEN r.IsClaimDenied = 1 THEN r.TrxAmt ELSE 0 END) AS RevenueAtRisk,
            COUNT(*) AS TotalClaims,
            (SELECT COUNT(*) FROM dbo.claimhistory WHERE ClaimWorkEndedTime IS NULL ${custWhereCH}) AS OpenQueue
          FROM dbo.recon_report r
          WHERE r.TrxType = 'Charge' AND r.PostDate >= DATEADD(MONTH, -12, GETDATE())
            ${custFilterRR}
        `);
        return { type: 'executive-summary', period: 'Last 12 months', ...result.recordset[0] };
      }
      default:
        return { type: reportType, message: 'Unknown report type' };
    }
  }

  /** Send report via email (uses nodemailer if SMTP configured) */
  private async sendReportEmail(
    recipients: string,
    reportName: string,
    reportType: string,
    data: any,
  ): Promise<boolean> {
    try {
      const smtpHost = process.env.SMTP_HOST;
      if (!smtpHost) {
        logger.info('[ScheduledReports] SMTP not configured, skipping email delivery');
        return false;
      }

      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const htmlBody = this.buildEmailHtml(reportName, reportType, data);

      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'reports@example.invalid',
        to: recipients,
        subject: `[RCM Report] ${reportName} \u2014 ${new Date().toLocaleDateString()}`,
        html: htmlBody,
      });

      return true;
    } catch (error) {
      logger.error('[ScheduledReports] email delivery failed', { error });
      return false;
    }
  }

  private buildEmailHtml(name: string, type: string, data: any): string {
    const rows = Object.entries(data)
      .filter(([k]) => k !== 'type' && k !== 'specialists' && k !== 'buckets')
      .map(([k, v]) => `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-weight:600">${k}</td><td style="padding:6px 12px;border:1px solid #e5e7eb">${v}</td></tr>`)
      .join('');

    let extraTable = '';
    if (data.specialists) {
      extraTable = '<h3>Specialist Performance</h3><table style="border-collapse:collapse;width:100%"><tr><th style="padding:6px 12px;border:1px solid #e5e7eb;text-align:left">Name</th><th style="padding:6px 12px;border:1px solid #e5e7eb">Worked</th><th style="padding:6px 12px;border:1px solid #e5e7eb">Closed</th></tr>';
      for (const s of data.specialists) {
        extraTable += `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb">${s.SpecialistName}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:center">${s.ClaimsWorked}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:center">${s.ClaimsClosed}</td></tr>`;
      }
      extraTable += '</table>';
    }
    if (data.buckets) {
      extraTable = '<h3>AR Aging Buckets</h3><table style="border-collapse:collapse;width:100%"><tr><th style="padding:6px 12px;border:1px solid #e5e7eb;text-align:left">Bucket</th><th style="padding:6px 12px;border:1px solid #e5e7eb">Claims</th><th style="padding:6px 12px;border:1px solid #e5e7eb">Total Charge</th></tr>';
      for (const b of data.buckets) {
        extraTable += `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb">${b.Bucket}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:center">${b.ClaimCount}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:right">$${Number(b.TotalCharge).toLocaleString()}</td></tr>`;
      }
      extraTable += '</table>';
    }

    return `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
        <h2 style="color:#0f172a">${name}</h2>
        <p style="color:#6b7280">Report generated on ${new Date().toLocaleString()}</p>
        <table style="border-collapse:collapse;width:100%">${rows}</table>
        ${extraTable}
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">This is an automated report from RCM Platform.</p>
      </div>
    `;
  }

  private calculateNextRun(frequency: string): Date {
    const now = new Date();
    switch (frequency) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        const next = new Date(now);
        next.setMonth(next.getMonth() + 1);
        return next;
      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  }
}
