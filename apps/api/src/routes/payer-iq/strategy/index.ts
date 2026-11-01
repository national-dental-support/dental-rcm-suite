import express from 'express';
import { PayerIQController } from '../../../controllers/payer-iq/index';

const router = express.Router();
const controller = new PayerIQController();

router.get('/builder-info', controller.getBuilderInfo);
router.get('/contract-options', controller.getContractOptions);
router.post('/optimize-proposed', controller.postOptimizeProposed);

export default router;
