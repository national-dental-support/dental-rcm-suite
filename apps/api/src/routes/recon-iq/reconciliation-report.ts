import { Router } from 'express';
import { ReconciliationReportController } from '../../controllers/recon-iq/reconciliation-report';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new ReconciliationReportController();

router.get('/filter-options', requireRole('Manager'), ctrl.getFilterOptions);
router.get('/summary',        requireRole('Manager'), ctrl.getSummary);
router.get('/by-payer',       requireRole('Manager'), ctrl.getByPayer);
router.get('/by-provider',    requireRole('Manager'), ctrl.getByProvider);
router.get('/monthly-trend',  requireRole('Manager'), ctrl.getMonthlyTrend);
router.get('/in-transit',     requireRole('Manager'), ctrl.getInTransit);
router.get('/posting-audit',  requireRole('Manager'), ctrl.getPostingAudit);
router.get('/export',         requireRole('Manager'), ctrl.getExport);

export default router;
