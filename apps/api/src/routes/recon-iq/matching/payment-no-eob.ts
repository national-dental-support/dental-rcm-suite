import express from 'express';
import { PaymentsWithNoEob } from '../../../controllers/recon-iq/matching/payment-no-eob';

const router = express.Router();
const controller = new PaymentsWithNoEob();

// GET /api/recon-iq/matching/payments-with-no-eob
router.get('/payments-with-no-eob', controller.get);

export default router;
