import { Router } from 'express';
import { AdminRemediationController } from '../../controllers/admin/remediation';
import { SOPRecommendationsController } from '../../controllers/admin/sop-recommendations';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new AdminRemediationController();
const recsCtrl = new SOPRecommendationsController();

// Step sets
router.get('/sets',            requireRole('Admin'), ctrl.listSets);
router.post('/sets',           requireRole('Admin'), ctrl.createSet);
router.get('/sets/:id',        requireRole('Admin'), ctrl.getSet);
router.put('/sets/:id',        requireRole('Admin'), ctrl.updateSet);
router.delete('/sets/:id',     requireRole('Admin'), ctrl.deleteSet);
router.post('/sets/:id/publish', requireRole('Admin'), ctrl.publishSet);
router.get('/sets/:id/history', requireRole('Admin'), ctrl.getSetHistory);

// Reason codes
router.get('/reason-codes', requireRole('Admin'), ctrl.listReasonCodes);

// Feedback queue
router.get('/feedback',       requireRole('Admin'), ctrl.listFeedback);
router.patch('/feedback/:id', requireRole('Admin'), ctrl.reviewFeedback);

// Smart SOP Recommendations
router.get('/recommendations',  requireRole('Admin'), recsCtrl.getRecommendations);
router.get('/effectiveness',    requireRole('Admin'), recsCtrl.getEffectiveness);

export default router;
