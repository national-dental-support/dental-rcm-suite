import { Request, Response, Router } from 'express';
import sql from 'mssql';
import Database from '../../../modules/db';
import rateLimit from 'express-rate-limit';
import { payerMixController } from '../../../controllers/analytics/payer-mix';

const router = Router();

router.post(
  '/insurance-collections',
  payerMixController.getInsuranceCollections
);
router.post(
  '/patient-collections',
  payerMixController.getPatientCollections,
);
router.post(
  '/collection-trends',
  payerMixController.getCollectionTrends,
);
router.post(
  '/payers-increasing-production',
  payerMixController.getPayersIncreasing
);

router.post(
  '/payers-decreasing-production',
  payerMixController.getPayersDecreasing
);

router.post(
  '/procedures-increasing-production',
  payerMixController.getProceduresIncreasing
);

router.post(
  '/procedures-decreasing-production',
  payerMixController.getProceduresDecreasing
);

router.post(
  '/payer-collection-details',
  payerMixController.getPayerCollectionDetails
);
export default router;
