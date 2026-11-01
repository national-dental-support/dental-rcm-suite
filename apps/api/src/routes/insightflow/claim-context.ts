import { Router } from 'express';
import { InsightFlowClaimContextController } from '../../controllers/insightflow/claim-context';

const router = Router();
const ctrl = new InsightFlowClaimContextController();

router.get('/:reasonCode', ctrl.get);

export default router;
