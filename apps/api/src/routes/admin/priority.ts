import { Router } from 'express';
import { PrioritySettingsController } from '../../controllers/admin/priority-settings';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new PrioritySettingsController();

router.get('/settings',      requireRole('Admin'), ctrl.getSettings);
router.put('/settings',      requireRole('Admin'), ctrl.updateSettings);
router.post('/recalculate',  requireRole('Admin'), ctrl.triggerRecalculate);
router.get('/top-claims',    requireRole('Manager'), ctrl.getTopClaims);

export default router;
