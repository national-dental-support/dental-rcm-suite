import { Request, Response, Router } from 'express';
import sql from 'mssql';
import Database from '../../../modules/db';
import rateLimit from 'express-rate-limit';
import { medicareDashboardController }  from '../../../controllers/analytics/medicare-dashboard'

const router = Router();
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
// });
router.post(
  '/procedure-and-claim-counts',
  medicareDashboardController.getCptAndClaimCountsByDOS,
);
router.post(
  '/charges-vs-medicare',
  medicareDashboardController.getChargesVsMedicareByDOS ,
);
router.post(
  '/payments-vs-medicare',
  medicareDashboardController.getPaymentsVsMedicareByDOS,
);
router.post(
  '/uncollected-medicare-per-claim',
  medicareDashboardController.getUncollectedMedicarePerClaim,
);
router.post(
  '/uncollected-mcr-per-claim',
  medicareDashboardController.getUncollectedMCRPerClaimByDOS,
);
router.post(
  '/uncollected-medicare-per-claim-mix',
  medicareDashboardController.getUncollectedMedicarePerClaimMix,
);
router.post(
  '/medicare-by-cpt-group',
  medicareDashboardController.getMedicareByCptGroup,
);
router.post(
  '/uncollected-medicare-by-cpt-group',
  medicareDashboardController.getUncollectedMedicareByCptGroup,
);


export default router;
