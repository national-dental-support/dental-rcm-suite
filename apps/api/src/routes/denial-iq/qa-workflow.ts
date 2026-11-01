import express from 'express';
import { createQaSample, listQaReviews, updateQaReview, createQaFinding, listQaFindings, getQaStats } from '../../controllers/denial-iq/qa-workflow';
import { requireRole } from '../../middleware/require-role';

const router = express.Router();

router.post('/sample',       requireRole('Manager'), createQaSample);
router.get('/reviews',       requireRole('Manager'), listQaReviews);
router.patch('/reviews/:id', requireRole('Manager'), updateQaReview);
router.post('/findings',     requireRole('Manager'), createQaFinding);
router.get('/findings',      requireRole('Manager'), listQaFindings);
router.get('/stats',         requireRole('Manager'), getQaStats);

export default router;
