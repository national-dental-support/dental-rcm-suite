import { Router } from 'express';
import { ReportBuilderController } from '../../controllers/insightflow/report-builder';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new ReportBuilderController();

router.get('/schema',     requireRole('Manager'), ctrl.getSchema);
router.post('/run',        requireRole('Manager'), ctrl.runReport);
router.get('/saved',       requireRole('Manager'), ctrl.listSaved);
router.post('/saved',      requireRole('Manager'), ctrl.saveReport);
router.delete('/saved/:id', requireRole('Manager'), ctrl.deleteSaved);

export default router;
