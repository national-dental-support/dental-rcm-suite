import { Request, Response, Router } from 'express';
import sql from 'mssql';
import Database from '../../../modules/db';
import rateLimit from 'express-rate-limit';
import { rcmController } from '../../../controllers/analytics/rcm';
import { requireRole } from '../../../middleware/require-role';

const databaseInstance = Database.getInstance();
const pool = databaseInstance.getPool();

const router = Router();

router.post('/claims-count', requireRole('User'), rcmController.getClaimsCount);
router.post('/gross-production', requireRole('User'), rcmController.getGrossProduction);
router.post('/collection-rate', requireRole('User'), rcmController.getCollectionRate);
router.post('/revenue-by-practice', requireRole('User'), rcmController.getRevenueByLocation);

//  NEW RCM chart endpoints
router.post(
  '/claim-value-by-status',
  requireRole('User'),
  rcmController.getClaimValueByStatus
);

router.post(
  '/claim-amounts-by-practice',
  requireRole('User'),
  rcmController.getClaimAmountsByPractice
);

router.post(
  '/collection-adjustment-trends',
  requireRole('User'),
  rcmController.getCollectionAdjustmentTrends
);

router.post(
  '/claim-amounts-by-payer',
  requireRole('User'),
  rcmController.getClaimAmountsByPayer
);

router.post(
  '/claim-values-by-type',
  requireRole('User'),
  rcmController.getClaimValuesByType
);

router.post(
  '/claims-count-by-location-group',
  rcmController.getClaimsCountByLocationGroup
);

export default router;
