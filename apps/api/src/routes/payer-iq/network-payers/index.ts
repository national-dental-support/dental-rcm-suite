import express from 'express';
import { NetworkPayersDropdown } from '../../../controllers/payer-iq/network-payers/network-payers-dropdown';

const router = express.Router();
const controller = new NetworkPayersDropdown();

router.get('/network-payers-dropdown', controller.get);

export default router;
