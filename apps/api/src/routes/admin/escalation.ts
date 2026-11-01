import { Router } from 'express';
import { EscalationChainsController } from '../../controllers/admin/escalation-chains';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new EscalationChainsController();

// Chain CRUD
router.get('/chains',       requireRole('Admin'), ctrl.listChains);
router.post('/chains',      requireRole('Admin'), ctrl.createChain);
router.put('/chains/:id',   requireRole('Admin'), ctrl.updateChain);
router.delete('/chains/:id', requireRole('Admin'), ctrl.deleteChain);

// SLA monitoring
router.get('/sla-status',   requireRole('Manager'), ctrl.getSlaStatus);

// Auto-escalation trigger (can be called by cron or admin)
router.post('/check-sla',   requireRole('Admin'), ctrl.checkAndAutoEscalate);

export default router;
