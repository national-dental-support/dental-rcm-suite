import { Router } from 'express';
import { ReferenceLibraryController } from '../../controllers/admin/reference-library';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new ReferenceLibraryController();

router.get('/categories', requireRole('Admin'), ctrl.listCategories);
router.get('/',           requireRole('Admin'), ctrl.list);
router.post('/',          requireRole('Admin'), ctrl.create);
router.put('/:id',        requireRole('Admin'), ctrl.update);
router.delete('/:id',     requireRole('Admin'), ctrl.delete);

export default router;
