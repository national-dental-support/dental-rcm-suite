import { Router } from 'express';
import { SecurityController } from '../../controllers/admin/security';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new SecurityController();

// Masking rules CRUD
router.get('/masking-rules',        requireRole('Admin'), ctrl.getMaskingRules);
router.post('/masking-rules',       requireRole('Admin'), ctrl.createMaskingRule);
router.put('/masking-rules/:id',    requireRole('Admin'), ctrl.updateMaskingRule);
router.delete('/masking-rules/:id', requireRole('Admin'), ctrl.deleteMaskingRule);

// Encryption config
router.get('/encryption',     requireRole('Admin'), ctrl.getEncryptionConfig);
router.put('/encryption',     requireRole('Admin'), ctrl.updateEncryptionConfig);

// Security status
router.get('/status',         requireRole('Admin'), ctrl.getSecurityStatus);

export default router;
