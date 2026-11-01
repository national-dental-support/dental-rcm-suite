import express from 'express';
import { SpecialistDailyDashboardController } from '../../../../controllers/denial-iq/specialist-view/daily-dashboard/index';

const router = express.Router();
const controller = new SpecialistDailyDashboardController();

router.get('/today-summary', controller.getTodaySummary);
router.get('/my-performance-summary', controller.getMyPerformanceSummary);
router.get('/analyst-proficiency', controller.getAnalystProficiency);
router.get('/performance-trends', controller.getPerformanceTrends);
router.get('/resolution-metrics', controller.getResolutionMetrics);
router.get('/peer-ranking', controller.getPeerRanking);

export default router;
