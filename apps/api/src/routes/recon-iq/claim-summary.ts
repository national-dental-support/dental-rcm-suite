import { Router } from 'express';
import { ReconIqClaimSummaryController } from '../../controllers/recon-iq/claim-summary';

const router = Router();
const ctrl = new ReconIqClaimSummaryController();

router.get('/:claimId', ctrl.get);

export default router;
