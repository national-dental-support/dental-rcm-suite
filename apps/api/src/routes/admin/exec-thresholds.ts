import { Router } from 'express';
import { ExecThresholdsController } from '../../controllers/admin/exec-thresholds';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new ExecThresholdsController();

router.get('/',    requireRole('Admin'), ctrl.getThresholds);
router.put('/',    requireRole('Admin'), ctrl.saveThresholds);
router.delete('/', requireRole('Admin'), ctrl.resetThresholds);

export default router;
