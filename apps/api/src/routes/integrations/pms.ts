import { Router } from 'express';
import { PMSController } from '../../controllers/integrations/pms';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new PMSController();

// Connections CRUD - Admin only
router.get('/connections',        requireRole('Admin'), ctrl.listConnections);
router.post('/connections',       requireRole('Admin'), ctrl.createConnection);
router.put('/connections/:id',    requireRole('Admin'), ctrl.updateConnection);
router.delete('/connections/:id', requireRole('Admin'), ctrl.deleteConnection);

// Test & sync - Admin only
router.post('/test/:id',          requireRole('Admin'), ctrl.testConnection);
router.post('/sync/:id',          requireRole('Admin'), ctrl.triggerSync);

// Activity logs - Admin only
router.get('/logs',               requireRole('Admin'), ctrl.getLogs);

// Field mappings - Admin only
router.get('/field-mappings/:connectionId',        requireRole('Admin'), ctrl.getFieldMappings);
router.post('/field-mappings/:connectionId',       requireRole('Admin'), ctrl.saveFieldMapping);
router.delete('/field-mappings/mapping/:id',       requireRole('Admin'), ctrl.deleteFieldMapping);

// Supported providers - Admin only
router.get('/providers',          requireRole('Admin'), ctrl.getProviders);

export default router;
