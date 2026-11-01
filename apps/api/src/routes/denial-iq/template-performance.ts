import express from 'express';
import { TemplatePerformanceController } from '../../controllers/denial-iq/template-performance.controller';
import { requireRole } from '../../middleware/require-role';

const router = express.Router();
const ctrl = new TemplatePerformanceController();

router.get('/', ctrl.leaderboard);
router.post('/outcome', ctrl.recordOutcome);
router.post('/refresh', requireRole('Admin'), ctrl.refresh);

export default router;
