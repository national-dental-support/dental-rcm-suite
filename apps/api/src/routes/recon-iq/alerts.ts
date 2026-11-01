import { Router } from 'express';
import { requireRole } from '../../middleware/require-role';
import { ReconAlertsController } from '../../controllers/recon-iq/alerts';

const router = Router();
const ctrl = new ReconAlertsController();

router.get('/',             ctrl.listAlerts);
router.patch('/:id/acknowledge', ctrl.acknowledge);
router.get('/config',       ctrl.getConfig);
router.put('/config',       requireRole('Manager'), ctrl.upsertConfig);
router.delete('/config/:id', requireRole('Manager'), ctrl.deleteConfig);

export default router;
