import express from 'express';
import { ClaimQueueController } from '../../../../controllers/denial-iq/manager-view/claim-queue/index';

const router = express.Router();
const controller = new ClaimQueueController();

router.get('/escalations', controller.getEscalations);
router.get('/unassigned', controller.getUnassigned);
router.get('/all-claims', controller.getAllClaims);

export default router;
