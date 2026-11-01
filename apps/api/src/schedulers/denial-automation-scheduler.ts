/**
 * Denial Automation Scheduler
 *
 * Runs every 5 minutes. Finds denied claims that have not been scored
 * in the last 24 hours and auto-scores them via the narrative scorer agent.
 * Claims scoring below 65 also receive an automatic rewrite suggestion.
 *
 * This ensures the AI Assist tab in the claim detail is pre-populated
 * when a specialist opens a denied claim - no manual trigger needed.
 */
import cron from 'node-cron';
import sql from 'mssql';
import logger from '../utils/logger';
import Database from '../modules/db';
import { withLock } from '../utils/distributed-lock';
import { runAsSystem } from '../modules/rls-context';
import { scoreNarrative, persistScore } from '../services/ai-agents/narrative-scorer-agent';
import { rewriteNarrative, persistRewrite } from '../services/ai-agents/rewrite-agent';

const INTERVAL_MINUTES = 5;
const LOW_SCORE_THRESHOLD = 65;
const BATCH_SIZE = 20;

async function findUnscoredDenials(pool: sql.ConnectionPool): Promise<Array<{ claim_id: string; customer_id: number }>> {
  const result = await pool.request().query(`
    SELECT TOP ${BATCH_SIZE} d.ClaimID AS claim_id, d.customer_id
    FROM (
      SELECT DISTINCT rr.ClaimID, rr.customer_id
      FROM dbo.recon_report rr
      WHERE rr.IsClaimDenied = 1
        AND rr.ClaimID IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM dbo.NarrativeScore ns
          WHERE ns.claim_id = rr.ClaimID
            AND ns.customer_id = rr.customer_id
            AND ns.scored_at >= DATEADD(HOUR, -24, GETUTCDATE())
        )
    ) d
  `);
  return result.recordset;
}

async function logRun(
  pool: sql.ConnectionPool,
  status: 'completed' | 'failed',
  itemsProcessed: number,
  itemsActioned: number,
  startedAt: Date,
  errorMessage?: string,
): Promise<void> {
  try {
    const req = pool.request();
    req.input('Status', sql.NVarChar(20), status);
    req.input('Processed', sql.Int, itemsProcessed);
    req.input('Actioned', sql.Int, itemsActioned);
    req.input('Started', sql.DateTime2, startedAt);
    req.input('Completed', sql.DateTime2, new Date());
    req.input('Error', sql.NVarChar(sql.MAX), errorMessage ?? null);
    await req.query(`
      INSERT INTO dbo.AiAgentRun
        (customer_id, agent_type, trigger_type, status, items_processed, items_actioned, error_message, started_at, completed_at)
      VALUES
        (NULL, 'denial-automation', 'scheduled', @Status, @Processed, @Actioned, @Error, @Started, @Completed)
    `);
  } catch (e: any) {
    logger.warn('[DenialAutomation] Failed to log run:', e?.message);
  }
}

async function runDenialAutomation(): Promise<void> {
  const pool = Database.getInstance().getPool();
  if (!pool?.connected) return;

  const startedAt = new Date();
  let processed = 0;
  let actioned = 0;

  try {
    const claims = await findUnscoredDenials(pool);
    if (!claims.length) return;

    for (const { claim_id, customer_id } of claims) {
      processed++;
      try {
        const scoreResult = await scoreNarrative(claim_id, customer_id);
        if (!scoreResult) continue;

        await persistScore(claim_id, customer_id, scoreResult);
        actioned++;

        if (scoreResult.score < LOW_SCORE_THRESHOLD) {
          try {
            const rewrite = await rewriteNarrative(claim_id, customer_id);
            if (rewrite) await persistRewrite(claim_id, customer_id, rewrite);
          } catch (e: any) {
            logger.warn(`[DenialAutomation] Rewrite failed for ${claim_id}: ${e?.message}`);
          }
        }
      } catch (e: any) {
        logger.warn(`[DenialAutomation] Score failed for ${claim_id}: ${e?.message}`);
      }
    }

    if (actioned > 0) {
      logger.info(`[DenialAutomation] Scored ${actioned}/${processed} denied claims`);
    }
    await logRun(pool, 'completed', processed, actioned, startedAt);
  } catch (e: any) {
    logger.error('[DenialAutomation] Run error:', e?.message);
    await logRun(pool, 'failed', processed, actioned, startedAt, e?.message);
  }
}

export function startDenialAutomationScheduler(): void {
  cron.schedule(`*/${INTERVAL_MINUTES} * * * *`, async () => {
    try {
      await withLock('denial-automation', 240, async () => {
        try {
          // G7: background job legitimately operates cross-tenant under RLS
          await runAsSystem(() => runDenialAutomation());
        } catch (e: any) {
          logger.error('[DenialAutomation] Tick error:', e?.message);
        }
      });
    } catch (lockErr: any) {
      logger.error('[DenialAutomation] lock acquisition failed', lockErr);
    }
  });

  logger.info(`[DenialAutomation] Denial automation scheduler started (every ${INTERVAL_MINUTES} minutes)`);
}
