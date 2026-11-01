import express from 'express';
import { PayerIntelligenceController } from '../../controllers/denial-iq/payer-intelligence';
import { requireRole } from '../../middleware/require-role';

const router = express.Router();
const ctrl = new PayerIntelligenceController();

// CARC code library (open to all authenticated denial-iq users)
router.get('/carc-descriptions', ctrl.listCarcDescriptions);
router.get('/carc-library',      ctrl.listCarcLibrary);
router.get('/carc/:code',        ctrl.getCarcDetail);

// Payer filing deadlines
router.get('/deadlines/all',  ctrl.listDeadlines);
router.get('/deadlines',      ctrl.getDeadline);
router.post('/deadlines',     requireRole('Admin'), ctrl.upsertDeadline);

export default router;
