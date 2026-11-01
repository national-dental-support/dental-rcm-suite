import { Router } from 'express';
import { BenchmarkingController } from '../../controllers/insightflow/benchmarking';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new BenchmarkingController();

router.get('/', requireRole('Manager'), ctrl.getBenchmarks);
router.get('/comparison', requireRole('Manager'), ctrl.getComparison);

export default router;
