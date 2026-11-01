import express from 'express';
import { MatchStats } from '../../../controllers/recon-iq/dashboard/match-stats';
import { DeniedClaimsAndNonPayments } from '../../../controllers/recon-iq/dashboard/denied-claims-and-non-payments';
import { EraEobPayment } from '../../../controllers/recon-iq/dashboard/era-eob-payment';
import { FinanceSummaryController } from '../../../controllers/recon-iq/finance-summary';

const router = express.Router();

const matchStatsController = new MatchStats();
const deniedController = new DeniedClaimsAndNonPayments();
const eraEobController = new EraEobPayment();
const financeSummaryController = new FinanceSummaryController();

// GET /api/recon-iq/dashboard/match-stats
router.get('/match-stats', matchStatsController.get);

// GET /api/recon-iq/dashboard/denied-claims-and-non-payments
router.get('/denied-claims-and-non-payments', deniedController.get);

// GET /api/recon-iq/dashboard/era-eob-payment
router.get('/era-eob-payment', eraEobController.get);

// GET /api/recon-iq/dashboard/finance-summary
router.get('/finance-summary', financeSummaryController.get);

export default router;
