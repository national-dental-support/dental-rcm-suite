import { Router } from 'express';
import { SpecialistScorecardsController } from '../../controllers/admin/specialist-scorecards';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new SpecialistScorecardsController();

router.get('/',       requireRole('Manager'), ctrl.getScorecards);
router.get('/goals',  requireRole('Manager'), ctrl.getGoals);
router.put('/goals',  requireRole('Manager'), ctrl.setGoals);

export default router;
