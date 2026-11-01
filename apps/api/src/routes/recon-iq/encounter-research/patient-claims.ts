import express from 'express';
import { PatientClaims } from '../../../controllers/recon-iq/encounter-research/patient-claims';

const router = express.Router();
const controller = new PatientClaims();

// GET /api/recon-iq/encounter-research/patient-claims/:patientAccount?
router.get('/patient-claims/:patientAccount?', controller.get);

export default router;
