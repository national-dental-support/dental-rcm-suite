import express from 'express';
import { AppealGeneratorController } from '../../controllers/denial-iq/appeal-generator';
import { requireRole } from '../../middleware/require-role';
import { phiAudit } from '../../middleware/phi-audit';

const router = express.Router();
const ctrl = new AppealGeneratorController();

router.get('/templates',          ctrl.listTemplates);
router.post('/templates',         requireRole('Admin'), ctrl.createTemplate);
router.put('/templates/:id',      requireRole('Admin'), ctrl.updateTemplate);
router.delete('/templates/:id',   requireRole('Admin'), ctrl.deleteTemplate);
router.get('/',                   ctrl.listAppeals);        // ?claimId=
router.post('/generate',          phiAudit('phi.appeal.generate'),    ctrl.generateLetter);
router.post('/generate-ai',       phiAudit('phi.appeal.generate-ai'), ctrl.generateAiLetter);
router.patch('/:id',              phiAudit('phi.appeal.status-update'), ctrl.updateAppealStatus);

export default router;
