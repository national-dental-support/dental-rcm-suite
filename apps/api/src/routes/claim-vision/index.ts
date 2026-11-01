import express from 'express';
import { Request, Response } from 'express';
import { ClaimVisionController } from '../../controllers/claim-vision/index';
import { SimulateRule } from '../../controllers/claim-vision/simulate-rule';
import { requireRole } from '../../middleware/require-role';
import { runEvaluation } from '../../controllers/claim-vision/rule-evaluator';
import { extractCustomerId } from '../../utils/resolve-user-scope';
import Database from '../../modules/db';
import logger from '../../utils/logger';

const router = express.Router();
const controller = new ClaimVisionController();
const simulateRule = new SimulateRule();

// Claim queries - AR Specialist+
router.get('/rejected-claims', requireRole('AR Specialist'), controller.getRejectedClaims);
router.get('/rejected-claims-trend', requireRole('AR Specialist'), controller.getRejectedClaimsTrend);
router.get('/rejected-claims-detail', requireRole('AR Specialist'), controller.getRejectedClaimsDetail);
router.patch('/rejected-claims/:id/status', requireRole('AR Specialist'), controller.updateRejectedClaimStatus);

// Rules CRUD - Admin only
router.post('/rules/simulate', requireRole('Admin'), simulateRule.post.bind(simulateRule));
router.get('/custom-rules', requireRole('Admin'), controller.getCustomRules);
router.get('/system-rules', requireRole('Admin'), controller.getSystemRules);
router.post('/rules', requireRole('Admin'), controller.createRule);
router.put('/rules/:id', requireRole('Admin'), controller.updateRule);
router.delete('/rules/:id', requireRole('Admin'), controller.deleteRule);
router.patch('/rules/reorder', requireRole('Admin'), controller.reorderRules);

// On-demand rule evaluation - Admin only
router.post('/rules/evaluate', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const pool = Database.getInstance().getPool();
    const customerId = extractCustomerId(req);
    const result = await runEvaluation(pool, customerId);
    return res.json({
      message: `Evaluation complete: ${result.inserted} new rejection(s) logged`,
      ...result,
    });
  } catch (e: any) {
    logger.error('[ClaimVision] /rules/evaluate error', e?.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
