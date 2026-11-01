import express from 'express';
import { DailyDashboardController } from '../../../../controllers/denial-iq/manager-view/daily-dashboard/index';
import { CapacityPlanningController } from '../../../../controllers/denial-iq/manager-view/daily-dashboard/capacity-planning';

const router = express.Router();
const controller = new DailyDashboardController();
const capacityCtrl = new CapacityPlanningController();

router.get('/yesterday-summary', controller.getYesterdaySummary);
router.get('/ar-mix', controller.getARMix);
router.get('/payment-breakdown-pie', controller.getPaymentBreakdownPie);
router.get('/revenue-trends', controller.getRevenueTrends);
router.get('/ar-by-location', controller.getARByLocation);
router.get('/staff-performance', controller.getStaffPerformance);
router.get('/training-matrix', controller.getTrainingMatrix);
router.get('/capacity-planning', capacityCtrl.get);

export default router;
