import { Router } from 'express';
import { MasterClaimController } from '../../controllers/claims/master';
import { phiAudit } from '../../middleware/phi-audit';

const router = Router();
const ctrl = new MasterClaimController();

router.get('/:id', phiAudit('phi.claim.master-view'), ctrl.get);

export default router;
