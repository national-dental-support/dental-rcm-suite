import { Router } from 'express';
import { ClaimVisionClaimSummaryController } from '../../controllers/claim-vision/claim-summary';

const router = Router();
const ctrl = new ClaimVisionClaimSummaryController();

router.get('/:claimId', ctrl.get);

export default router;
