import express from 'express';
import { ScheduledReportsController } from '../../controllers/insightflow/scheduled-reports';
import { requireRole } from '../../middleware/require-role';

const router = express.Router();
const ctrl = new ScheduledReportsController();

router.get('/', requireRole('Manager'), ctrl.list);
router.post('/', requireRole('Manager'), ctrl.create);
router.put('/:id', requireRole('Manager'), ctrl.update);
router.delete('/:id', requireRole('Manager'), ctrl.delete);
router.post('/:id/run', requireRole('Manager'), ctrl.runNow);

export default router;
