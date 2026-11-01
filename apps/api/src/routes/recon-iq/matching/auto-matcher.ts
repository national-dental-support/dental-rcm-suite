import { Router } from 'express';
import { requireRole } from '../../../middleware/require-role';
import { AutoMatcherController } from '../../../controllers/recon-iq/auto-matcher';

const router = Router();
const ctrl = new AutoMatcherController();

router.get('/suggestions',               ctrl.getSuggestions);
router.post('/generate-suggestions',     requireRole('Manager'), ctrl.generateSuggestions);
router.post('/suggestions/:id/accept',   ctrl.acceptSuggestion);
router.post('/suggestions/:id/reject',   ctrl.rejectSuggestion);
router.post('/auto-accept',              requireRole('Manager'), ctrl.autoAccept);

export default router;
