import cron from 'node-cron';
import Database from '../modules/db';
import logger from '../utils/logger';
import { broadcastToCustomer } from '../websockets/index';
import { withLock } from '../utils/distributed-lock';
import { runAsSystem } from '../modules/rls-context';

/**
 * Multi-level Escalation Path Scheduler - runs every 30 minutes.
 *
 * Checks claims at each escalation step and auto-escalates to the next
 * level when the trigger_after_hours threshold is exceeded.
 *
 * Path: Specialist -> Supervisor (24h) -> Manager (48h) -> Finance (72h)
 */
export function startEscalationPathScheduler(): void {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await withLock('escalation-path', 900, async () => {
        try {
          // G7: background job legitimately operates cross-tenant under RLS
          await runAsSystem(() => processEscalationPaths());
        } catch (err: any) {
          logger.error(`[EscalationPath] Error: ${err?.message}`);
        }
      });
    } catch (lockErr: any) {
      logger.error('[EscalationPath] lock acquisition failed', lockErr);
    }
  });
  logger.info('[EscalationPath] Multi-level escalation scheduler started (every 30 minutes)');
}

async function processEscalationPaths(): Promise<void> {
  const pool = Database.getInstance().getPool();
  if (!pool.connected) return;

  // Find claims that are escalated and due for next-level escalation
  const result = await pool.request().query(`
    ;WITH EscalatedClaims AS (
      SELECT
        ch.ClaimID,
        ch.ClaimHistoryId,
        ch.AssignedTo,
        ch.escalation_path_id,
        ch.escalation_step,
        ch.ClaimWorkStartedTime,
        DATEDIFF(HOUR, COALESCE(ch.ClaimWorkStartedTime, ch.ClaimModifiedDate, GETUTCDATE()), GETUTCDATE()) AS hours_at_step,
        c.customer_id
      FROM dbo.claimhistory ch
      INNER JOIN dbo.claims c ON c.ClaimID = ch.ClaimID
      WHERE ch.ClaimStatus = 'Escalated'
        AND ch.ClaimWorkEndedTime IS NULL
        AND ch.escalation_path_id IS NOT NULL
        AND ch.escalation_step IS NOT NULL
    ),
    NextSteps AS (
      SELECT
        ec.*,
        eps_current.trigger_after_hours AS current_threshold,
        eps_next.step_order AS next_step_order,
        eps_next.escalate_to_role AS next_role,
        eps_next.escalate_to_user_id AS next_user_id
      FROM EscalatedClaims ec
      INNER JOIN dbo.EscalationPathStep eps_current
        ON eps_current.path_id = ec.escalation_path_id AND eps_current.step_order = ec.escalation_step
      LEFT JOIN dbo.EscalationPathStep eps_next
        ON eps_next.path_id = ec.escalation_path_id AND eps_next.step_order = ec.escalation_step + 1
      WHERE ec.hours_at_step >= eps_current.trigger_after_hours
        AND eps_next.id IS NOT NULL  -- There is a next step
    )
    SELECT * FROM NextSteps
  `);

  if (!result.recordset.length) return;

  let escalated = 0;
  for (const claim of result.recordset) {
    try {
      // Find a user with the target role
      let targetUserId = claim.next_user_id;
      if (!targetUserId) {
        const userResult = await pool.request().query(`
          SELECT TOP 1 userID FROM dbo.Users
          WHERE Role = '${claim.next_role}'
            AND archived = 0 AND disabled = 0
            AND customer_id = ${claim.customer_id}
          ORDER BY NEWID()
        `);
        targetUserId = userResult.recordset[0]?.userID;
      }

      if (!targetUserId) {
        logger.warn(`[EscalationPath] No user found for role '${claim.next_role}' \u2014 skipping ${claim.ClaimID}`);
        continue;
      }

      // Close current row
      await pool.request().query(`
        UPDATE dbo.claimhistory
        SET ClaimWorkEndedTime = GETUTCDATE(),
            ClaimModifiedDate = CAST(GETDATE() AS date),
            ClaimStatus = 'Escalated'
        WHERE ClaimHistoryId = '${claim.ClaimHistoryId}'
      `);

      // Get next CH ID
      const maxId = await pool.request().query(`
        SELECT TOP 1 ClaimHistoryId FROM dbo.claimhistory
        ORDER BY CAST(REPLACE(ClaimHistoryId, 'CH', '') AS int) DESC
      `);
      const nextNum = parseInt((maxId.recordset[0]?.ClaimHistoryId || 'CH0').replace('CH', '')) + 1;
      const newChId = `CH${nextNum}`;

      // Create new row at next escalation level
      await pool.request().query(`
        INSERT INTO dbo.claimhistory
          (ClaimHistoryId, ClaimID, AssignedTo, ClaimStatus,
           ClaimModifiedDate, escalation_path_id, escalation_step,
           DateOfService, ClaimSubmittedDate)
        SELECT
          '${newChId}', '${claim.ClaimID}', ${targetUserId}, 'Escalated',
          CAST(GETDATE() AS date), ${claim.escalation_path_id}, ${claim.next_step_order},
          DateOfService, ClaimSubmittedDate
        FROM dbo.claimhistory WHERE ClaimHistoryId = '${claim.ClaimHistoryId}'
      `);

      escalated++;

      // Broadcast update scoped to the claim's customer
      try {
        if (claim.customer_id) {
          broadcastToCustomer(claim.customer_id, 'claim:updated', {
            claimId: claim.ClaimID,
            type: 'auto-escalated',
            fromStep: claim.escalation_step,
            toStep: claim.next_step_order,
            toRole: claim.next_role,
          });
        }
      } catch { /* non-critical */ }
    } catch (err: any) {
      logger.warn(`[EscalationPath] Failed to escalate ${claim.ClaimID}: ${err?.message}`);
    }
  }

  if (escalated > 0) {
    logger.info(`[EscalationPath] Auto-escalated ${escalated} claim(s) to next level`);
  }
}
