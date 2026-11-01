import { Router } from 'express';
import { requireRole } from '../../middleware/require-role';
import { AdminConfigController } from '../../controllers/recon-iq/admin-config';

const router = Router();
const ctrl = new AdminConfigController();

router.get('/',  ctrl.getConfig);
router.put('/',  requireRole('Manager'), ctrl.updateConfig);

export default router;
