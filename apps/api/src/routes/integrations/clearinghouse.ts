import { Router } from 'express';
import { ClearinghouseController } from '../../controllers/integrations/clearinghouse';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new ClearinghouseController();

// Connections CRUD - Admin only
router.get('/connections',       requireRole('Admin'), ctrl.listConnections);
router.post('/connections',      requireRole('Admin'), ctrl.createConnection);
router.put('/connections/:id',   requireRole('Admin'), ctrl.updateConnection);
router.delete('/connections/:id', requireRole('Admin'), ctrl.deleteConnection);

// Test connection - Admin only
router.post('/test/:id',         requireRole('Admin'), ctrl.testConnection);

// Claim status check - AR Specialist+
router.post('/check-status',     requireRole('AR Specialist'), ctrl.checkClaimStatus);

// Activity logs - Admin only
router.get('/logs',              requireRole('Admin'), ctrl.getLogs);

// Supported providers - Admin only
router.get('/providers',         requireRole('Admin'), ctrl.getProviders);

export default router;
