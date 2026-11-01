import { Router } from 'express';
import { kpiController } from '../../../controllers/analytics/kpi/kpi';

const router = Router();

// These paths are relative to /api/analytics/kpis

router.post('/list', kpiController.getKpiList);
router.post('/detail/:slug', kpiController.getKpiDetail);

export default router;
