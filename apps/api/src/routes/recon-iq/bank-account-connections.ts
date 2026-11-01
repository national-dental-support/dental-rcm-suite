import { Router } from 'express';
import { BankAccountConnectionController } from '../../controllers/recon-iq/bank-account-connections';

const router = Router();
const ctrl = new BankAccountConnectionController();

router.get('/audit-log',    ctrl.auditLog);
router.get('/',             ctrl.list);
router.post('/',            ctrl.create);
router.post('/:id/test',    ctrl.testConnection);
router.patch('/:id',        ctrl.update);
router.delete('/:id',       ctrl.remove);

export default router;
