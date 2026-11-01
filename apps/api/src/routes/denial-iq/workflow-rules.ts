import express from 'express';
import { WorkflowRulesController } from '../../controllers/denial-iq/workflow-rules';
import { requireRole } from '../../middleware/require-role';

const router = express.Router();
const ctrl = new WorkflowRulesController();

router.get('/', requireRole('Manager'), ctrl.list);
router.post('/', requireRole('Admin'), ctrl.create);
router.put('/:id', requireRole('Admin'), ctrl.update);
router.delete('/:id', requireRole('Admin'), ctrl.delete);
router.post('/evaluate', requireRole('AR Specialist'), ctrl.evaluate);

export default router;
