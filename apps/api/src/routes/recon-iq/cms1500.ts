import { Router } from 'express';
import { ReconIqCms1500Controller } from '../../controllers/recon-iq/cms1500';

const router = Router();
const ctrl = new ReconIqCms1500Controller();

router.get('/:claimId/cms1500', ctrl.get);

export default router;
