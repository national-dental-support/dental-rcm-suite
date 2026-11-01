import { Router } from 'express';
import { AdminSettingsController } from '../../controllers/admin/settings';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new AdminSettingsController();

router.get('/session-timeout', requireRole('Admin'), ctrl.getSessionTimeout);
router.put('/session-timeout', requireRole('Admin'), ctrl.setSessionTimeout);
router.get('/inactivity-threshold', requireRole('Admin'), ctrl.getInactivityThreshold);
router.put('/inactivity-threshold', requireRole('Admin'), ctrl.setInactivityThreshold);
router.get('/sla-schedules', requireRole('Admin'), ctrl.getSlaSchedules);
router.put('/sla-schedules', requireRole('Admin'), ctrl.setSlaSchedules);

export default router;
