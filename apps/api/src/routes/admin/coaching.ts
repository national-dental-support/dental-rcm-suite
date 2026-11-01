import { Router } from 'express';
import { CoachingRecommendationsController } from '../../controllers/admin/coaching-recommendations';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new CoachingRecommendationsController();

router.get('/recommendations',       requireRole('Manager'), ctrl.listRecommendations);
router.post('/generate',             requireRole('Admin'), ctrl.generateRecommendations);
router.patch('/recommendations/:id', requireRole('Manager'), ctrl.updateRecommendation);
router.get('/summary',               requireRole('Manager'), ctrl.getSummary);

export default router;
