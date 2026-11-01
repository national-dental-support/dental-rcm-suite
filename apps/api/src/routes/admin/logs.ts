import { Router } from 'express';
import { AdminLogsController } from '../../controllers/admin/logs';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new AdminLogsController();

router.get('/events', requireRole('Admin'), ctrl.getEvents);
router.get('/errors', requireRole('Admin'), ctrl.getErrors);

export default router;
