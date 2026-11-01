import express from 'express';
import { SpecialistClaimQueueController } from '../../../../controllers/denial-iq/specialist-view/claim-queue/index';

const router = express.Router();
const controller = new SpecialistClaimQueueController();

router.get('/my-queue', controller.getMyQueue);
router.get('/all-claims', controller.getAllClaims);
router.get('/escalations', controller.getEscalations);
router.get('/unassigned', controller.getUnassigned);
router.get('/pending', controller.getPending);
router.get('/awaiting-adjudication', controller.getAwaitingAdjudication);
router.get('/not-submitted', controller.getNotSubmitted);
router.get('/export', controller.exportQueue);

export default router;
