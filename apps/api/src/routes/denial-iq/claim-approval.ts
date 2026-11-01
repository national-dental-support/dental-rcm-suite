import express from 'express';
import { ClaimApprovalController } from '../../controllers/denial-iq/claim-approval.controller';
import { requireRole } from '../../middleware/require-role';
import { phiAudit } from '../../middleware/phi-audit';

const router = express.Router();
const ctrl = new ClaimApprovalController();

router.get('/', ctrl.list);                                                      // managers see queue; specialists see their submissions
router.get('/:id', ctrl.get);
router.post('/',    phiAudit('phi.claim.approval-submit'), ctrl.submit);         // specialist submits
router.patch('/:id', requireRole('Manager'), phiAudit('phi.claim.approval-review'), ctrl.review); // manager approves/rejects
router.delete('/:id', phiAudit('phi.claim.approval-recall'), ctrl.recall);       // specialist recalls

export default router;
