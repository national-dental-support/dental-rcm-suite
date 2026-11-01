import express from 'express';
import { PaymentReconciliation } from '../../../controllers/recon-iq/reconciliation/reconciliation';

const router = express.Router();
const controller = new PaymentReconciliation();

// GET /api/recon-iq/reconciliation/payment-reconciliation
router.get('/payment-reconciliation', controller.get);

export default router;
