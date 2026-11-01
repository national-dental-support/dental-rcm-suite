import { Request, Response, Router } from 'express';
import sql from 'mssql';
import Database from '../../../modules/db';
import rateLimit from 'express-rate-limit';
import { arController } from '../../../controllers/analytics/ar';

const databaseInstance = Database.getInstance();
const pool = databaseInstance.getPool();
const router = Router();

router.post('/ar-summary', arController.getARSummary);
router.post('/ar-balance', arController.getARBalance);
router.post('/ar-days', arController.getARDays);
router.post('/ar-collections-breakdown', arController.getARCollectionsBreakdown);
router.post('/ar-distribution', arController.getARDistribution);
router.post('/ar-days-by-practice', arController.getARDaysByPractice);

export default router;
