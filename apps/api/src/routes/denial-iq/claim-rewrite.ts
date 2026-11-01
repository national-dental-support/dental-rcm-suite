import express from 'express';
import { ClaimRewriteController } from '../../controllers/denial-iq/claim-rewrite.controller';
import { phiAudit } from '../../middleware/phi-audit';

const router = express.Router();
const ctrl = new ClaimRewriteController();

router.get('/:claimId',      ctrl.getLatest);
router.post('/:claimId',     phiAudit('phi.claim.rewrite-generate'), ctrl.generate);
router.patch('/:id/accept',  phiAudit('phi.claim.rewrite-accept'),   ctrl.updateAcceptance);

export default router;
