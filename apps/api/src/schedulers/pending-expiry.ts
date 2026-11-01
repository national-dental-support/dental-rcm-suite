import cron from 'node-cron';
import Database from '../modules/db';
import logger from '../utils/logger';
import { withLock } from '../utils/distributed-lock';
import { runAsSystem } from '../modules/rls-context';

/**
 * Pending Claim Expiry - runs hourly.
 *
 * Claims in the pending queue whose pending_until date has passed
 * are automatically moved back to the unassigned queue.
 */
export function startPendingExpiryScheduler(): void {
  // Every hour at minute 5 (with distributed lock)
  cron.schedule('5 * * * *', async () => {
    await withLock('pending-expiry', 300, async () => {
      try {
        // G7: background job legitimately operates cross-tenant under RLS
        await runAsSystem(() => expirePendingClaims());
      } catch (err: any) {
        logger.error(`[PendingExpiry] Error: ${err?.message}`);
      }
    });
  });
  logger.info('[PendingExpiry] Pending claim expiry checker started (hourly)');
}

async function expirePendingClaims(): Promise<void> {
  const pool = Database.getInstance().getPool();
  if (!pool.connected) return;

  const result = await pool.request().query(`
    UPDATE dbo.claimhistory
    SET ClaimWorkEndedTime = GETUTCDATE(),
        ClaimModifiedDate = CAST(GETDATE() AS date),
        ClaimStatus = 'Unassigned'
    WHERE ClaimStatus = 'Pending'
      AND ClaimWorkEndedTime IS NULL
      AND pending_until IS NOT NULL
      AND pending_until < CAST(GETDATE() AS date)
  `);

  const expired = result.rowsAffected[0] || 0;
  if (expired > 0) {
    logger.info(`[PendingExpiry] Expired ${expired} pending claim(s) \u2014 moved to unassigned queue`);
  }
}
