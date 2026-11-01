import express from 'express';
import { Patients } from '../../../controllers/recon-iq/encounter-research/patients';

const router = express.Router();
const controller = new Patients();

// GET /api/recon-iq/encounter-research/patients
router.get('/patients', controller.get);

export default router;
