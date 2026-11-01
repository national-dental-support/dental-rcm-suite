import express from 'express';
import { PayerIQController } from '../../../controllers/payer-iq/index';


const router = express.Router();
const controller = new PayerIQController();


router.get('/network-leases-summary', controller.getNetworkLeases);
export default router;