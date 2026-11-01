import { Router } from 'express';
import { AccessReviewController } from '../../controllers/admin/access-review';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new AccessReviewController();

router.get('/', requireRole('Admin'), ctrl.list);

export default router;
