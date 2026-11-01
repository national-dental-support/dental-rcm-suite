import { Router } from 'express';
import { requireRole } from '../../middleware/require-role';
import { BankEscalationsController } from '../../controllers/recon-iq/bank-escalations';

const router = Router();
const ctrl = new BankEscalationsController();

router.get('/stats',  ctrl.stats);
router.get('/',       ctrl.list);
router.post('/',      ctrl.create);
router.patch('/:id',  requireRole('Manager'), ctrl.update);

export default router;
