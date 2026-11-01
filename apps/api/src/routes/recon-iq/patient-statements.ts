import { Router } from 'express';
import { PatientStatementsController } from '../../controllers/recon-iq/patient-statements';

const router = Router();
const ctrl = new PatientStatementsController();

router.get('/balances',        ctrl.getBalances);
router.post('/generate-batch', ctrl.generateBatch);
router.get('/batches',         ctrl.getRecentBatches);
router.get('/batch/:batchId',  ctrl.getBatchStatus);
router.get('/:id/pdf',         ctrl.getStatementPdf);

export default router;
