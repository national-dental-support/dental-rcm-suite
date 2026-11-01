import { Router } from 'express';
import { DenialCodeMappingController } from '../../controllers/admin/denial-code-mapping';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new DenialCodeMappingController();

router.get('/groupings',   requireRole('Admin'), ctrl.listGroupings);
router.get('/',            requireRole('Admin'), ctrl.list);
router.post('/',           requireRole('Admin'), ctrl.create);
router.put('/:id',         requireRole('Admin'), ctrl.update);
router.delete('/:id',      requireRole('Admin'), ctrl.delete);

export default router;
