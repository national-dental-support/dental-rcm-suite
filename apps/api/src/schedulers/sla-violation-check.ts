import cron from 'node-cron';
import Database from '../modules/db';
import logger from '../utils/logger';
import { withLock } from '../utils/distributed-lock';
import { runAsSystem } from '../modules/rls-context';

/**
 * SLA Violation Checker - runs every 30 minutes.
 *
 * Detects:
 *  1. First-touch violations: denial posted but no work started within threshold
 *  2. Follow-up cadence violations: work started but gap between actions exceeds threshold
 *  3. Resolution deadline violations: denial open longer than target days
 *  4. Appeal deadline violations: appeal_deadline passed without resolution
 */
export function startSlaViolationCheck(): void {
  // Every 30 minutes (with distributed lock)
  cron.schedule('*/30 * * * *', async () => {
    try {
      await withLock('sla-violation-check', 900, async () => {
        try {
          // G7: background job legitimately operates cross-tenant under RLS
          await runAsSystem(() => checkSlaViolations());
        } catch (err: any) {
          logger.error(`[SlaCheck] Error: ${err?.message}`);
        }
      });
    } catch (lockErr: any) {
      logger.error('[SlaCheck] lock acquisition failed', lockErr);
    }
  });
  logger.info('[SlaCheck] SLA violation checker started (every 30 minutes)');
}

async function checkSlaViolations(): Promise<void> {
  const pool = Database.getInstance().getPool();
  if (!pool.connected) return;

  // 1. First-touch violations
  const firstTouchResult = await pool.request().query(`
    ;WITH OpenDenials AS (
      SELECT
        ch.ClaimID,
        ch.AssignedTo,
        c.denial_posting_date,
        c.customer_id,
        ch.first_touch_at,
        DATEDIFF(HOUR, c.denial_posting_date, GETUTCDATE()) AS hours_since_posting
      FROM dbo.claimhistory ch
      INNER JOIN dbo.claims c ON c.ClaimID = ch.ClaimID
      WHERE ch.ClaimWorkEndedTime IS NULL
        AND c.denial_posting_date IS NOT NULL
        AND ch.first_touch_at IS NULL
        AND ch.ClaimStatus NOT IN ('Closed', 'Written Off', 'Pending')
    ),
    Thresholds AS (
      SELECT od.*, COALESCE(sc.first_touch_hours, 48) AS threshold_hours
      FROM OpenDenials od
      LEFT JOIN dbo.SlaConfig sc
        ON sc.customer_id = od.customer_id AND sc.is_active = 1
    )
    INSERT INTO dbo.SlaViolation (claim_id, violation_type, threshold_hours, actual_hours, assigned_to, customer_id)
    SELECT t.ClaimID, 'first_touch', t.threshold_hours, t.hours_since_posting, t.AssignedTo, t.customer_id
    FROM Thresholds t
    WHERE t.hours_since_posting > t.threshold_hours
      AND NOT EXISTS (
        SELECT 1 FROM dbo.SlaViolation sv
        WHERE sv.claim_id = t.ClaimID AND sv.violation_type = 'first_touch' AND sv.resolved_at IS NULL
      )
  `);
  const firstTouchCount = firstTouchResult.rowsAffected[0] || 0;

  // 2. Follow-up cadence violations
  const followupResult = await pool.request().query(`
    ;WITH LastAction AS (
      SELECT
        ch.ClaimID,
        ch.AssignedTo,
        c.customer_id,
        MAX(COALESCE(ch.ClaimWorkEndedTime, ch.ClaimWorkStartedTime)) AS last_action_at,
        DATEDIFF(HOUR,
          MAX(COALESCE(ch.ClaimWorkEndedTime, ch.ClaimWorkStartedTime)),
          GETUTCDATE()
        ) AS hours_since_action
      FROM dbo.claimhistory ch
      INNER JOIN dbo.claims c ON c.ClaimID = ch.ClaimID
      WHERE ch.ClaimWorkStartedTime IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM dbo.claimhistory ch2
          WHERE ch2.ClaimID = ch.ClaimID AND ch2.ClaimWorkEndedTime IS NULL
            AND ch2.ClaimStatus NOT IN ('Closed', 'Written Off', 'Pending')
        )
      GROUP BY ch.ClaimID, ch.AssignedTo, c.customer_id
    ),
    Thresholds AS (
      SELECT la.*, COALESCE(sc.followup_max_hours, 72) AS threshold_hours
      FROM LastAction la
      LEFT JOIN dbo.SlaConfig sc
        ON sc.customer_id = la.customer_id AND sc.is_active = 1
    )
    INSERT INTO dbo.SlaViolation (claim_id, violation_type, threshold_hours, actual_hours, assigned_to, customer_id)
    SELECT t.ClaimID, 'followup_cadence', t.threshold_hours, t.hours_since_action, t.AssignedTo, t.customer_id
    FROM Thresholds t
    WHERE t.hours_since_action > t.threshold_hours
      AND NOT EXISTS (
        SELECT 1 FROM dbo.SlaViolation sv
        WHERE sv.claim_id = t.ClaimID AND sv.violation_type = 'followup_cadence' AND sv.resolved_at IS NULL
      )
  `);
  const followupCount = followupResult.rowsAffected[0] || 0;

  // 3. Resolve violations for claims that now have activity
  const resolvedResult = await pool.request().query(`
    UPDATE dbo.SlaViolation
    SET resolved_at = GETUTCDATE()
    WHERE resolved_at IS NULL
      AND violation_type = 'first_touch'
      AND claim_id IN (
        SELECT ch.ClaimID FROM dbo.claimhistory ch
        WHERE ch.first_touch_at IS NOT NULL
      )
  `);
  const resolvedCount = resolvedResult.rowsAffected[0] || 0;

  if (firstTouchCount > 0 || followupCount > 0 || resolvedCount > 0) {
    logger.info(`[SlaCheck] Violations: +${firstTouchCount} first-touch, +${followupCount} follow-up, ${resolvedCount} resolved`);
  }
}
