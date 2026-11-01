import express from 'express';
import { ApplyMatch } from '../../../controllers/recon-iq/matching/apply-match';

const router = express.Router();
const controller = new ApplyMatch();

// POST /api/recon-iq/matching/apply-match
router.post('/apply-match', controller.post);

export default router;
