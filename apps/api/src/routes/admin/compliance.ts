import { Router } from 'express';
import { ComplianceController } from '../../controllers/admin/compliance';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new ComplianceController();

router.get('/dashboard',       requireRole('Admin'), ctrl.getDashboard);
router.get('/access-review',   requireRole('Admin'), ctrl.getAccessReviewStatus);

export default router;
