import { Router } from 'express';
import { AdminThemeController } from '../../controllers/admin/theme';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new AdminThemeController();

router.get('/presets',      requireRole('Admin'), ctrl.getPresets);
router.post('/presets',     requireRole('Admin'), ctrl.savePreset);
router.delete('/presets/:name', requireRole('Admin'), ctrl.deletePreset);

router.get('/', requireRole('Admin'), ctrl.getTheme);
router.put('/', requireRole('Admin'), ctrl.saveTheme);

export default router;
