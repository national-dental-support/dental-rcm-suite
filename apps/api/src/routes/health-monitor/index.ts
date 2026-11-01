import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import Database from '../../modules/db';
import logger from '../../utils/logger';

/**
 * Health endpoints.
 *
 * Mounted before authentication so a container orchestrator or load balancer
 * can reach them, which is also why they expose no data about the deployment
 * beyond whether it is serving.
 *
 * The upstream platform also exposed container restart and self-remediation
 * actions here, driven by a cloud provider's container API. Those are
 * deployment-specific and are not part of this suite: restarting a container is
 * the orchestrator's job, not the application's.
 */

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

/** Liveness. Answers "is this process serving?" and nothing else. */
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Readiness. Answers "can this process serve traffic?", which means the
 * database is reachable. Returns 503 when it is not, so an orchestrator can
 * hold traffic back rather than sending it into failures.
 */
router.get('/ready', limiter, async (_req: Request, res: Response) => {
  try {
    const pool = Database.getInstance().getPool();
    await pool.request().query('SELECT 1 AS ready');
    return res.status(200).json({ status: 'ready', database: 'up' });
  } catch (err) {
    logger.error('[Health] readiness check failed', {
      error: err instanceof Error ? err.message : String(err),
      alert: 'HEALTH_DATABASE_UNREACHABLE',
    });
    return res.status(503).json({ status: 'not-ready', database: 'down' });
  }
});

export default router;
