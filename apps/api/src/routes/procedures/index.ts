import { Router } from 'express';
import { proceduresController } from '../../controllers/procedures';
import { requireRole } from '../../middleware/require-role';
// import rateLimit from 'express-rate-limit'
// const databaseInstance = Database.getInstance()
// const pool = databaseInstance.getPool()
const router = Router();
//const limiter = rateLimit({
//  windowMs: 15 * 60 * 1000, // 15 minutes
//  max: 100, // limit each IP to 100 requests per windowMs
//});

/** Medicare Dashboard Routes */
router.post(
  '/stats/procedure-and-claim-counts',
  requireRole('Manager'),
  proceduresController.getProceduresAndClaimCounts,
);
router.post(
  '/stats/charges-by-payer',
  requireRole('Manager'),
  proceduresController.getPayerChargesByDateOfService,
);
router.post(
  '/stats/payments-by-payer-and-dos',
  requireRole('Manager'),
  proceduresController.getPayerPaymentsByDOS,
);
router.post(
  '/stats/uncollected-dollar-amounts-by-payer',
  requireRole('Manager'),
  proceduresController.getPayerUncollectedDollarAmounts,
);
router.post(
  '/stats/uncollected-dollar-amounts-by-payer-per-claim',
  requireRole('Manager'),
  proceduresController.getPayerUncollectedDollarAmountsPerClaimByPercentage,
);
router.post(
  '/stats/uncollected-dollar-amounts-by-payer-per-claim-by-percentage',
  requireRole('Manager'),
  proceduresController.getPayerUncollectedDollarAmountCategoriesByPercentage,
);
router.post(
  '/stats/procedures-billed-by-cpt-group',
  requireRole('Manager'),
  proceduresController.getProceduresBilledByCPTGroup,
);
router.post(
  '/stats/procedures-uncollected-by-cpt-group',
  requireRole('Manager'),
  proceduresController.getProceduresUncollectedBilledByCPTGroup,
);

// Payer Mix
// router.post('/stats/insurance-collections', proceduresController.getTotalInsuranceCollections);
// router.post('/stats/patient-collections', proceduresController.getTotalPatientCollections);
// router.post('/stats/collections-by-date-range', proceduresController.getCollectionsByDateRange);
router.post(
  '/stats/ar-balance',
  requireRole('Manager'),
  proceduresController.getTotalARBalance,
);
router.post(
  '/stats/source-data',
  requireRole('Manager'),
  proceduresController.getSourceData,
);

// RCM
router.post(
  '/stats/revenue-by-location',
  requireRole('Manager'),
  proceduresController.getRevenueByLocation,
);
router.post(
  '/stats/rcm-summary',
  requireRole('Manager'),
  proceduresController.getRCMSummary,
);

// AR
router.post(
  '/stats/ar-summary',
  requireRole('Manager'),
  proceduresController.getARSummary,
);
router.post(
  '/stats/ar-and-collections',
  requireRole('Manager'),
  proceduresController.getARAndCollections,
);

export default router;
