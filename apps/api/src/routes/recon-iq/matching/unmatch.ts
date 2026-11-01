import { Router } from 'express';
import { UnmatchController } from '../../../controllers/recon-iq/matching/unmatch';
import { requireRole } from '../../../middleware/require-role';

const router = Router();
const ctrl = new UnmatchController();

router.get('/matched-pairs',              ctrl.getMatchedPairs);
router.get('/reconciliation/:id',         ctrl.getOne);
router.delete('/reconciliation/:id',      requireRole('Manager'), ctrl.unmatch);

export default router;
