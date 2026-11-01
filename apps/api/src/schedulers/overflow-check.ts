import cron from 'node-cron';
import Database from '../modules/db';
import logger from '../utils/logger';
import { withLock } from '../utils/distributed-lock';
import { runAsSystem } from '../modules/rls-context';

/**
 * Queue Overflow Checker - runs every 15 minutes.
 *
 * Checks QueueOverflowConfig thresholds and triggers auto-assignment
 * or reassignment when queues exceed limits.
 */
export function startOverflowCheck(): void {
  // Every 15 minutes (with distributed lock)
  cron.schedule('*/15 * * * *', async () => {
    await withLock('overflow-check', 600, async () => {
      try {
        // G7: background job legitimately operates cross-tenant under RLS
        await runAsSystem(() => checkOverflow());
      } catch (err: any) {
        logger.error(`[OverflowCheck] Error: ${err?.message}`);
      }
    });
  });
  logger.info('[OverflowCheck] Queue overflow checker started (every 15 minutes)');
}

async function checkOverflow(): Promise<void> {
  const pool = Database.getInstance().getPool();
  if (!pool.connected) return;

  // Get active overflow configs
  const configs = await pool.request().query(`
    SELECT * FROM dbo.QueueOverflowConfig WHERE is_active = 1
  `);

  if (!configs.recordset.length) return;

  for (const config of configs.recordset) {
    try {
      await evaluateOverflowRule(pool, config);
    } catch (err: any) {
      logger.warn(`[OverflowCheck] Rule ${config.id} failed: ${err?.message}`);
    }
  }
}

async function evaluateOverflowRule(pool: any, config: any): Promise<void> {
  const { id, source_queue_type, source_queue_id, max_active_claims, max_aging_days, overflow_target_type, customer_id } = config;

  // Count active claims for this queue source
  let countQuery: string;
  if (source_queue_type === 'specialist') {
    countQuery = `
      SELECT COUNT(*) AS active_count,
             MAX(DATEDIFF(DAY, c.ClaimSubmittedDate, GETDATE())) AS max_aging
      FROM dbo.claimhistory ch
      INNER JOIN dbo.claims c ON c.ClaimID = ch.ClaimID
      WHERE ch.AssignedTo = ${source_queue_id}
        AND ch.ClaimWorkEndedTime IS NULL
        AND ch.ClaimStatus NOT IN ('Closed', 'Written Off')
        AND c.customer_id = ${customer_id}
    `;
  } else {
    // Location-based queue
    countQuery = `
      SELECT COUNT(*) AS active_count,
             MAX(DATEDIFF(DAY, c.ClaimSubmittedDate, GETDATE())) AS max_aging
      FROM dbo.claimhistory ch
      INNER JOIN dbo.claims c ON c.ClaimID = ch.ClaimID
      INNER JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID
      WHERE ch.ClaimWorkEndedTime IS NULL
        AND ch.ClaimStatus NOT IN ('Closed', 'Written Off')
        AND rr.Location = (SELECT LocationName FROM dbo.location WHERE LocationID = ${source_queue_id})
        AND c.customer_id = ${customer_id}
    `;
  }

  const result = await pool.request().query(countQuery);
  const { active_count, max_aging } = result.recordset[0] || { active_count: 0, max_aging: 0 };

  const isOverCapacity = active_count > max_active_claims;
  const isOverAged = max_aging > max_aging_days;

  if (!isOverCapacity && !isOverAged) return;

  logger.warn(
    `[OverflowCheck] Rule ${id} triggered: ${active_count} claims (max ${max_active_claims}), ` +
    `max aging ${max_aging}d (max ${max_aging_days}d) \u2014 routing to ${overflow_target_type}`
  );

  // Calculate how many claims to overflow
  const overflowCount = Math.min(active_count - max_active_claims, 10); // Max 10 at a time
  if (overflowCount <= 0) return;

  // Get oldest unworked claims from this queue
  const claimsToOverflow = await pool.request().query(`
    SELECT TOP ${overflowCount} ch.ClaimID
    FROM dbo.claimhistory ch
    INNER JOIN dbo.claims c ON c.ClaimID = ch.ClaimID
    WHERE ch.ClaimWorkEndedTime IS NULL
      AND ch.ClaimWorkStartedTime IS NULL
      AND ch.ClaimStatus NOT IN ('Closed', 'Written Off', 'Escalated')
      ${source_queue_type === 'specialist' ? `AND ch.AssignedTo = ${source_queue_id}` : ''}
      AND c.customer_id = ${customer_id}
    ORDER BY c.ClaimSubmittedDate ASC
  `);

  for (const row of claimsToOverflow.recordset) {
    // Unassign and mark for overflow
    await pool.request().query(`
      UPDATE dbo.claimhistory
      SET ClaimStatus = 'Unassigned',
          AssignedTo = NULL,
          ClaimModifiedDate = CAST(GETDATE() AS date),
          working_queue_type = '${overflow_target_type}'
      WHERE ClaimID = '${row.ClaimID}'
        AND ClaimWorkEndedTime IS NULL
    `);
  }

  // Update last triggered timestamp
  await pool.request().query(`
    UPDATE dbo.QueueOverflowConfig
    SET last_triggered_at = GETUTCDATE()
    WHERE id = ${id}
  `);

  logger.info(`[OverflowCheck] Overflowed ${claimsToOverflow.recordset.length} claims from rule ${id}`);
}
