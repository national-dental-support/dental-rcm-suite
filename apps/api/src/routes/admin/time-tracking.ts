import { Router } from 'express';
import { TimeTrackingController } from '../../controllers/admin/time-tracking';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new TimeTrackingController();

router.get('/summary',     requireRole('Manager'), ctrl.getSummary);
router.get('/utilization',  requireRole('Manager'), ctrl.getUtilization);
router.get('/time-sinks',   requireRole('Manager'), ctrl.getTimeSinks);
router.get('/by-payer',     requireRole('Manager'), ctrl.getByPayer);
router.get('/benchmarks',   requireRole('Manager'), ctrl.getBenchmarks);
router.get('/trend',        requireRole('Manager'), ctrl.getTrend);

export default router;
