import express from 'express';
import { EobWithNoPayment } from '../../../controllers/recon-iq/matching/eob-no-payment';

const router = express.Router();
const controller = new EobWithNoPayment();

// GET /api/recon-iq/matching/eobs-with-no-payment
router.get('/eobs-with-no-payment', controller.get);

export default router;
