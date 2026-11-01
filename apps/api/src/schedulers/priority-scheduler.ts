import cron from 'node-cron';
import sql from 'mssql';
import logger from '../utils/logger';
import Database from '../modules/db';
import { withLock } from '../utils/distributed-lock';
import { runAsSystem } from '../modules/rls-context';

/**
 * Priority Recalculation Scheduler
 *
 * Periodically recalculates claim priority scores based on multiple factors:
 *   - Aging days (weight configurable, default 40%)
 *   - Charge amount / financial impact (default 25%)
 *   - Timely filing deadline urgency (default 20%)
 *   - Specialist workload balance (default 15%)
 *
 * Stores results in ClaimPriority table. Queue controllers JOIN against
 * this table for ordering instead of simple ROW_NUMBER(ORDER BY AgingDays).
 *
 * Call `startPriorityScheduler()` from server startup.
 */

interface PriorityWeights {
  aging: number;
  value: number;
  deadline: number;
  workload: number;
  proficiency: number;
}

const DEFAULT_WEIGHTS: PriorityWeights = { aging: 40, value: 25, deadline: 20, workload: 15, proficiency: 0 };
const DEFAULT_INTERVAL = 5; // minutes

async function getConfig(pool: sql.ConnectionPool): Promise<{ weights: PriorityWeights; enabled: boolean }> {
  try {
    const result = await pool.request().query(`
      SELECT [key], value FROM dbo.AppConfig
      WHERE [key] IN ('priority_weights', 'priority_recalc_enabled')
    `);
    let weights = { ...DEFAULT_WEIGHTS };
    let enabled = true;
    for (const row of result.recordset) {
      if (row.key === 'priority_weights') {
        try { weights = JSON.parse(row.value); } catch { /* use defaults */ }
      }
      if (row.key === 'priority_recalc_enabled') {
        enabled = row.value === '1' || row.value === 'true';
      }
    }
    return { weights, enabled };
  } catch {
    return { weights: { ...DEFAULT_WEIGHTS }, enabled: true };
  }
}

export async function recalculatePriorities(): Promise<number> {
  const pool = Database.getInstance().getPool();
  if (!pool) return 0;

  const { weights, enabled } = await getConfig(pool);
  if (!enabled) return 0;

  const wProficiency = weights.proficiency ?? 0;

  // proficiency_component is created by db/migrations/904_deferred_schema.sql.
  // It used to be added here with ALTER TABLE on every run, which cannot work:
  // the application connects as a restricted login with no schema rights, so
  // the statement failed and took the whole recalculation with it - twice a
  // tick, logged as an empty object. Schema belongs in a migration.

  // Compute priority scores for all open (active) claims in one query
  // Uses MERGE to upsert into ClaimPriority
  const result = await pool.request()
    .input('wAging',       sql.Float, weights.aging)
    .input('wValue',       sql.Float, weights.value)
    .input('wDeadline',    sql.Float, weights.deadline)
    .input('wWorkload',    sql.Float, weights.workload)
    .input('wProficiency', sql.Float, wProficiency)
    .query(`
      ;WITH OpenClaims AS (
        SELECT
          c.ClaimID,
          c.customer_id,
          DATEDIFF(DAY, c.ClaimSubmittedDate, CAST(GETDATE() AS DATE)) AS AgingDays,
          c.ChargeAmt,
          /* Most recent assignment per claim */
          (SELECT TOP 1 ch2.AssignedTo FROM dbo.claimhistory ch2
           WHERE ch2.ClaimID = c.ClaimID AND ch2.ClaimWorkEndedTime IS NULL
           ORDER BY ch2.ClaimWorkStartedTime DESC) AS AssignedTo,
          /* CARC code from the most recent history entry that has one */
          (SELECT TOP 1 ch3.CARCCode FROM dbo.claimhistory ch3
           WHERE ch3.ClaimID = c.ClaimID AND ch3.CARCCode IS NOT NULL
           ORDER BY ch3.ClaimWorkStartedTime DESC) AS CARCCode
        FROM dbo.claims c
        WHERE EXISTS (
          SELECT 1 FROM dbo.claimhistory ch
          WHERE ch.ClaimID = c.ClaimID
            AND ch.ClaimWorkEndedTime IS NULL
            AND ch.ClaimWorkStartedTime IS NOT NULL
        )
      ),
      /* Workload: count open claims per specialist */
      Workload AS (
        SELECT AssignedTo, COUNT(*) AS OpenCount
        FROM OpenClaims
        GROUP BY AssignedTo
      ),
      MaxWorkload AS (
        SELECT MAX(OpenCount) AS MaxOpen FROM Workload
      ),
      /*
       * Proficiency: each specialist's avg resolution time per CARC code
       * (last 90 days, minimum 3 samples for reliability).
       * Score > 50 = faster than avg (get more of these claims)
       * Score < 50 = slower than avg (get fewer)
       * Score = 50 = no data / neutral
       */
      SpecialistPerf AS (
        SELECT
          ch.AssignedTo,
          ch.CARCCode,
          AVG(CAST(DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS FLOAT)) AS AvgMinutes
        FROM dbo.claimhistory ch
        WHERE ch.ClaimWorkEndedTime IS NOT NULL
          AND ch.ClaimWorkStartedTime IS NOT NULL
          AND ch.CARCCode IS NOT NULL
          AND ch.AssignedTo IS NOT NULL
          AND ch.ClaimWorkStartedTime >= DATEADD(DAY, -90, GETDATE())
          AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) BETWEEN 1 AND 1440
        GROUP BY ch.AssignedTo, ch.CARCCode
        HAVING COUNT(*) >= 3
      ),
      OverallPerf AS (
        SELECT CARCCode, AVG(AvgMinutes) AS OverallAvgMinutes
        FROM SpecialistPerf
        GROUP BY CARCCode
      ),
      Scored AS (
        SELECT
          oc.ClaimID,
          /* Aging component: 0-100 scaled, capped at 180 days */
          ISNULL(CASE WHEN oc.AgingDays >= 180 THEN 100.0
               ELSE CAST(oc.AgingDays AS FLOAT) / 180.0 * 100.0
          END, 0.0) AS AgingScore,
          /* Value component: 0-100 scaled, capped at $5000 */
          ISNULL(CASE WHEN oc.ChargeAmt >= 5000 THEN 100.0
               WHEN oc.ChargeAmt <= 0 THEN 0.0
               ELSE CAST(oc.ChargeAmt AS FLOAT) / 5000.0 * 100.0
          END, 0.0) AS ValueScore,
          /* Deadline urgency: proxy using common timely filing windows */
          ISNULL(CASE
            WHEN oc.AgingDays >= 150 THEN 100.0
            WHEN oc.AgingDays >= 120 THEN 80.0
            WHEN oc.AgingDays >= 90  THEN 60.0
            WHEN oc.AgingDays >= 60  THEN 30.0
            ELSE 10.0
          END, 10.0) AS DeadlineScore,
          /* Workload inverse: lower workload specialist = higher priority */
          ISNULL(CASE WHEN mw.MaxOpen = 0 OR w.OpenCount IS NULL THEN 50.0
               ELSE (1.0 - CAST(w.OpenCount AS FLOAT) / CAST(mw.MaxOpen AS FLOAT)) * 100.0
          END, 50.0) AS WorkloadScore,
          /*
           * Proficiency: (2 - specialist_avg/overall_avg) * 50
           *   ratio=0.5 (2x faster) \u2192 score=75
           *   ratio=1.0 (same)      \u2192 score=50
           *   ratio=2.0 (2x slower) \u2192 score=0
           * Neutral (50) when no data exists for this specialist+code combo.
           */
          CASE
            WHEN sp.AvgMinutes IS NULL OR op.OverallAvgMinutes IS NULL OR op.OverallAvgMinutes = 0
              THEN 50.0
            WHEN (2.0 - sp.AvgMinutes / op.OverallAvgMinutes) * 50.0 > 100.0
              THEN 100.0
            WHEN (2.0 - sp.AvgMinutes / op.OverallAvgMinutes) * 50.0 < 0.0
              THEN 0.0
            ELSE (2.0 - sp.AvgMinutes / op.OverallAvgMinutes) * 50.0
          END AS ProficiencyScore,
          oc.customer_id
        FROM OpenClaims oc
        LEFT JOIN Workload w         ON w.AssignedTo  = oc.AssignedTo
        LEFT JOIN SpecialistPerf sp  ON sp.AssignedTo = oc.AssignedTo AND sp.CARCCode = oc.CARCCode
        LEFT JOIN OverallPerf op     ON op.CARCCode   = oc.CARCCode
        CROSS JOIN MaxWorkload mw
      )
      MERGE dbo.ClaimPriority AS target
      USING (
        SELECT
          ClaimID,
          ISNULL(AgingScore        * @wAging       / 100.0, 0)
        + ISNULL(ValueScore        * @wValue       / 100.0, 0)
        + ISNULL(DeadlineScore     * @wDeadline    / 100.0, 0)
        + ISNULL(WorkloadScore     * @wWorkload    / 100.0, 0)
        + ISNULL(ProficiencyScore  * @wProficiency / 100.0, 0) AS priority_score,
          ISNULL(AgingScore        * @wAging       / 100.0, 0) AS aging_component,
          ISNULL(ValueScore        * @wValue       / 100.0, 0) AS value_component,
          ISNULL(DeadlineScore     * @wDeadline    / 100.0, 0) AS deadline_component,
          ISNULL(WorkloadScore     * @wWorkload    / 100.0, 0) AS workload_component,
          ISNULL(ProficiencyScore  * @wProficiency / 100.0, 0) AS proficiency_component,
          customer_id
        FROM Scored
      ) AS source ON target.ClaimID = source.ClaimID
      WHEN MATCHED THEN
        UPDATE SET
          priority_score        = source.priority_score,
          aging_component       = source.aging_component,
          value_component       = source.value_component,
          deadline_component    = source.deadline_component,
          workload_component    = source.workload_component,
          proficiency_component = source.proficiency_component,
          recalculated_at       = GETUTCDATE()
      WHEN NOT MATCHED THEN
        INSERT (ClaimID, priority_score, aging_component, value_component, deadline_component, workload_component, proficiency_component, recalculated_at, customer_id)
        VALUES (source.ClaimID, source.priority_score, source.aging_component, source.value_component, source.deadline_component, source.workload_component, source.proficiency_component, GETUTCDATE(), source.customer_id);

      SELECT @@ROWCOUNT AS affected;
    `);

  return result.recordset[0]?.affected ?? 0;
}

export function startPriorityScheduler(): void {
  // Run every 5 minutes (with distributed lock)
  cron.schedule(`*/${DEFAULT_INTERVAL} * * * *`, async () => {
    try {
      await withLock('priority-scheduler', 240, async () => {
        try {
          // G7: background job legitimately operates cross-tenant under RLS
          const count = await runAsSystem(() => recalculatePriorities());
          if (count > 0) {
            logger.info(`[PriorityScheduler] recalculated ${count} claim priorities`);
          }
        } catch (error) {
          // err.message, not the Error object: passing { error } serialises to
          // {} and the log line said nothing at all, which is how a failing
          // ALTER TABLE went unexplained on every tick.
          logger.error('[PriorityScheduler] tick error', {
            err: error instanceof Error ? error.message : String(error),
            alert: 'PRIORITY_SCHEDULER_FAILED',
          });
        }
      });
    } catch (lockErr: any) {
      logger.error('[PriorityScheduler] lock acquisition failed', {
        err: lockErr instanceof Error ? lockErr.message : String(lockErr),
        alert: 'PRIORITY_SCHEDULER_LOCK_FAILED',
      });
    }
  });

  // Run once on startup after a short delay (let DB pool initialize)
  setTimeout(async () => {
    try {
      const count = await runAsSystem(() => recalculatePriorities());
      logger.info(`[PriorityScheduler] initial run \u2014 ${count} claims scored`);
    } catch (error) {
      logger.error('[PriorityScheduler] initial run error', {
        err: error instanceof Error ? error.message : String(error),
        alert: 'PRIORITY_SCHEDULER_FAILED',
      });
    }
  }, 10000);

  logger.info(`[PriorityScheduler] started \u2014 recalculating every ${DEFAULT_INTERVAL} minutes`);
}
