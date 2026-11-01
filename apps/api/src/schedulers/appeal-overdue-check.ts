import cron from 'node-cron';
import sql from 'mssql';
import Database from '../modules/db';
import logger from '../utils/logger';
import { withLock } from '../utils/distributed-lock';
import { runAsSystem } from '../modules/rls-context';

const DEFAULT_APPEAL_RESPONSE_DAYS = 45;

/**
 * Appeal Overdue Check - runs daily at 07:15 UTC.
 *
 * Claims with appeal_sent_at set, no outcome yet, and past the payer response
 * window are flagged by raising their priority to OVERDUE on claimhistory.
 */
export function startAppealOverdueScheduler(): void {
  cron.schedule('15 7 * * *', async () => {
    try {
      await withLock('appeal-overdue', 300, async () => {
        try {
          // G7: background job legitimately operates cross-tenant under RLS
          await runAsSystem(() => flagOverdueAppeals());
        } catch (err: any) {
          logger.error(`[AppealOverdue] Error: ${err?.message}`);
        }
      });
    } catch (lockErr: any) {
      logger.error('[AppealOverdue] lock acquisition failed', lockErr);
    }
  });
  logger.info('[AppealOverdue] Appeal overdue scheduler started (daily 07:15 UTC)');
}

async function flagOverdueAppeals(): Promise<void> {
  const pool = Database.getInstance().getPool();
  if (!pool.connected) return;

  // Fetch per-customer response window from AppConfig; fall back to default.
  const configResult = await pool.request().query(`
    SELECT customer_id, CAST(value AS INT) AS response_days
    FROM dbo.AppConfig
    WHERE [key] = 'appeal_response_days'
  `);

  const windowByCustomer = new Map<number | null, number>();
  for (const row of configResult.recordset) {
    windowByCustomer.set(row.customer_id ?? null, row.response_days ?? DEFAULT_APPEAL_RESPONSE_DAYS);
  }

  // Get all claims with pending appeals past the response window.
  const result = await pool.request().query(`
    SELECT ch.ClaimID, ch.customer_id
    FROM dbo.claimhistory ch
    WHERE ch.appeal_sent_at IS NOT NULL
      AND ch.appeal_outcome IS NULL
      AND DATEDIFF(day, ch.appeal_sent_at, GETUTCDATE()) > ${DEFAULT_APPEAL_RESPONSE_DAYS}
  `);

  if (!result.recordset.length) {
    logger.info('[AppealOverdue] No overdue appeals found');
    return;
  }

  // Flag claims as OVERDUE.
  const r = pool.request();
  const ids = result.recordset.map((row: any) => `'${row.ClaimID}'`).join(',');
  const flagged = await r.query(`
    UPDATE dbo.claimhistory
    SET ClaimPriority = 'OVERDUE', ClaimModifiedDate = CAST(GETDATE() AS date)
    WHERE ClaimID IN (${ids})
      AND appeal_sent_at IS NOT NULL
      AND appeal_outcome IS NULL
  `);

  logger.info(`[AppealOverdue] Flagged ${flagged.rowsAffected[0]} overdue appeal claim(s)`);
}
