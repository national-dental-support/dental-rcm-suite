import cron from 'node-cron';
import sql from 'mssql';
import Database from '../modules/db';
import logger from '../utils/logger';
import { runAsSystem } from '../modules/rls-context';
import { detectAlerts } from '../services/ai-agents/alert-agent';

/**
 * AI Alert Detection Scheduler.
 *
 * Runs detectAlerts() for every active customer and persists results to
 * dbo.AiAlert. Scheduled twice daily so timely-filing urgency alerts (which
 * are date-sensitive) are surfaced mid-day as well as at start of business.
 *
 * Skips a customer if Ollama is unavailable - detectAlerts() degrades
 * gracefully (returns alerts without AI explanations).
 */
async function runDetectionForAllCustomers(): Promise<void> {
  const pool = Database.getInstance().getPool();
  if (!pool.connected) return;

  // dbo.Customers has is_active. It has no disabled or archived column - those
  // are on dbo.Users - so the original predicate here raised "Invalid column
  // name 'disabled'" and this scheduler threw on every run.
  const customerResult = await pool.request().query<{ uid: number }>(
    `SELECT uid FROM dbo.Customers WHERE is_active = 1`,
  );

  const customers = customerResult.recordset;
  if (!customers.length) return;

  let totalInserted = 0;

  for (const { uid: customerId } of customers) {
    try {
      const alerts = await detectAlerts(customerId);
      for (const alert of alerts) {
        await pool.request()
          .input('custId',   sql.Int,           customerId)
          .input('type',     sql.NVarChar(50),  alert.alertType)
          .input('severity', sql.NVarChar(20),  alert.severity)
          .input('title',    sql.NVarChar(255), alert.title)
          .input('detail',   sql.NVarChar(sql.MAX), alert.detail)
          .input('aiExpl',   sql.NVarChar(sql.MAX), alert.aiExplanation ?? null)
          .input('actions',  sql.NVarChar(sql.MAX), JSON.stringify(alert.recommendedActions))
          .query(`
            INSERT INTO dbo.AiAlert
              (customer_id, alert_type, severity, title, detail, ai_explanation, recommended_actions)
            VALUES
              (@custId, @type, @severity, @title, @detail, @aiExpl, @actions)
          `);
        totalInserted++;
      }
    } catch (err: any) {
      logger.error(`[AiAlertDetection] customer ${customerId} failed: ${err?.message}`);
    }
  }

  logger.info(`[AiAlertDetection] Detection complete \u2014 ${totalInserted} alert(s) across ${customers.length} customer(s)`);
}

export function startAiAlertDetectionScheduler(): void {
  // 6 AM UTC - start of business alerts (denial spikes, collection drops, backlog)
  cron.schedule('0 6 * * *', async () => {
    try {
      // G7: background job legitimately operates cross-tenant under RLS
      await runAsSystem(() => runDetectionForAllCustomers());
    } catch (err: any) {
      logger.error(`[AiAlertDetection] 06:00 run failed: ${err?.message}`);
    }
  });

  // 12 PM UTC - mid-day run prioritises timely-filing urgency (time-sensitive)
  cron.schedule('0 12 * * *', async () => {
    try {
      await runAsSystem(() => runDetectionForAllCustomers());
    } catch (err: any) {
      logger.error(`[AiAlertDetection] 12:00 run failed: ${err?.message}`);
    }
  });

  logger.info('[AiAlertDetection] AI alert detection scheduler started (daily 06:00 + 12:00 UTC)');
}
