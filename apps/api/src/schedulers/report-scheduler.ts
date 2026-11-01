import cron from 'node-cron';
import sql from 'mssql';
import logger from '../utils/logger';
import Database from '../modules/db';
import { ScheduledReportsController } from '../controllers/insightflow/scheduled-reports';
import { withLock } from '../utils/distributed-lock';
import { runAsSystem } from '../modules/rls-context';

/**
 * Report Scheduler - runs every 15 minutes checking for due reports.
 * Uses distributed lock to ensure only one pod executes per cycle.
 * Call `startReportScheduler()` from server startup to activate.
 */
export function startReportScheduler(): void {
  const ctrl = new ScheduledReportsController();

  // Run every 15 minutes
  // G7: background job legitimately operates cross-tenant under RLS
  cron.schedule('*/15 * * * *', () => runAsSystem(async () => {
    try {
    const ran = await withLock('report-scheduler', 600, async () => {
    try {
      const pool = Database.getInstance().getPool();
      if (!pool) return;

      // Find reports due to run
      const dueResult = await pool.request().query(`
        SELECT id, name, report_type, frequency, recipients
        FROM dbo.ScheduledReports
        WHERE is_active = 1
          AND next_run_at IS NOT NULL
          AND next_run_at <= GETDATE()
      `);

      if (dueResult.recordset.length === 0) return;

      logger.info(`[ReportScheduler] ${dueResult.recordset.length} report(s) due`);

      for (const schedule of dueResult.recordset) {
        try {
          const data = await ctrl.generateReportData(schedule.report_type);

          // Calculate next run
          let nextRun: Date;
          const now = new Date();
          switch (schedule.frequency) {
            case 'weekly':
              nextRun = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
              break;
            case 'monthly': {
              nextRun = new Date(now);
              nextRun.setMonth(nextRun.getMonth() + 1);
              break;
            }
            default:
              nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          }

          // Update timestamps
          await pool.request()
            .input('id', sql.Int, schedule.id)
            .input('nextRun', sql.DateTime2, nextRun)
            .query(`
              UPDATE dbo.ScheduledReports
              SET last_run_at = GETDATE(), next_run_at = @nextRun
              WHERE id = @id
            `);

          // Attempt email delivery (if SMTP configured)
          if (process.env.SMTP_HOST) {
            try {
              const nodemailer = require('nodemailer');
              const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                  user: process.env.SMTP_USER,
                  pass: process.env.SMTP_PASS,
                },
              });

              await transporter.sendMail({
                from: process.env.SMTP_FROM || 'reports@example.invalid',
                to: schedule.recipients,
                subject: `[RCM Report] ${schedule.name} \u2014 ${new Date().toLocaleDateString()}`,
                html: `<pre>${JSON.stringify(data, null, 2)}</pre>`,
              });
            } catch (emailErr) {
              logger.warn(`[ReportScheduler] email failed for report ${schedule.id}`, { error: emailErr });
            }
          }

          logger.info(`[ReportScheduler] executed report "${schedule.name}" (id=${schedule.id})`);
        } catch (reportErr) {
          logger.error(`[ReportScheduler] failed to run report ${schedule.id}`, { error: reportErr });
        }
      }
    } catch (error) {
      logger.error('[ReportScheduler] tick error', { error });
    }
    }); // end withLock
    if (!ran) logger.info('[ReportScheduler] skipped \u2014 another instance holds the lock');
    } catch (lockErr: any) {
      logger.error('[ReportScheduler] lock acquisition failed', lockErr);
    }
  }));

  logger.info('[ReportScheduler] started \u2014 checking every 15 minutes');
}
