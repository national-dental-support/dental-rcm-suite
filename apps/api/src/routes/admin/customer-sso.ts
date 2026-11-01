import { Router } from 'express';
import { CustomerSSOController } from '../../controllers/admin/customer-sso';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new CustomerSSOController();

// SSO config CRUD - Super Admin only
router.get('/configs',        requireRole('Super Admin'), ctrl.listConfigs);
router.get('/configs/:id',    requireRole('Super Admin'), ctrl.getConfig);
router.post('/configs',       requireRole('Super Admin'), ctrl.createConfig);
router.put('/configs/:id',    requireRole('Super Admin'), ctrl.updateConfig);
router.delete('/configs/:id', requireRole('Super Admin'), ctrl.deleteConfig);

// Domain lookup (used by login flow - no role check needed)
router.get('/lookup',         ctrl.lookupByDomain);

// Test config - Super Admin only
router.post('/test/:id',      requireRole('Super Admin'), ctrl.testConfig);

export default router;
