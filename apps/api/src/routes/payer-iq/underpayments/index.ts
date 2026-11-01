import express from 'express';
import { PayerIQController } from '../../../controllers/payer-iq/index';
import { UnderpaymentDisputesController } from '../../../controllers/payer-iq/underpayments/disputes';

const router = express.Router();
const controller = new PayerIQController();
const disputes = new UnderpaymentDisputesController();

router.get('/at-risk-payers', controller.getAtRiskPayers);

// Dispute workflow
router.get('/:claimNumber/dispute',       disputes.get);
router.post('/:claimNumber/dispute',      disputes.create);
router.patch('/:claimNumber/dispute/:id', disputes.update);
router.post('/:claimNumber/review',       disputes.review);

export default router;
