import express from 'express';
import { FullyReconciledPayments } from '../../../controllers/recon-iq/fully-reconciled/fully-paid-and-reconciled';

const router = express.Router();
const controller = new FullyReconciledPayments();

// GET /api/recon-iq/fully-reconciled/fully-paid-and-reconciled
router.get('/fully-paid-and-reconciled', controller.get);

// GET /api/recon-iq/fully-reconciled/claims/:fileId
router.get('/claims/:fileId', controller.getClaims);

export default router;
