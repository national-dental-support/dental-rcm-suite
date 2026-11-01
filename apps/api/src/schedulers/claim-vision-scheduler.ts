import cron from 'node-cron';
import logger from '../utils/logger';
import Database from '../modules/db';
import { withLock } from '../utils/distributed-lock';
import { runAsSystem } from '../modules/rls-context';
import { runEvaluation } from '../controllers/claim-vision/rule-evaluator';

const SCHEDULE = '0 2 * * *'; // 2 AM daily

async function runClaimVisionEvaluation(): Promise<void> {
  const pool = Database.getInstance().getPool();
  if (!pool?.connected) return;

  try {
    const result = await runEvaluation(pool);
    if (result.inserted > 0 || result.rulesEvaluated > 0) {
      logger.info(`[ClaimVision] Scheduled run: ${result.rulesEvaluated} rules, ${result.inserted} new rejections`);
    }
  } catch (e: any) {
    logger.error('[ClaimVision] Scheduled evaluation error:', e?.message);
  }
}

export function startClaimVisionScheduler(): void {
  cron.schedule(SCHEDULE, async () => {
    await withLock('claim-vision-eval', 3600, async () => {
      try {
        // G7: background job legitimately operates cross-tenant under RLS
        await runAsSystem(() => runClaimVisionEvaluation());
      } catch (e: any) {
        logger.error('[ClaimVision] Tick error:', e?.message);
      }
    });
  });

  logger.info('[ClaimVision] Rule evaluation scheduler started (daily at 2 AM)');
}
