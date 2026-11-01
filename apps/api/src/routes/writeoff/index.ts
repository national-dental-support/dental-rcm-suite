import { Router } from 'express';
import { WriteOffWorkflowController } from '../../controllers/writeoff/workflow';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new WriteOffWorkflowController();

// Rules CRUD (Admin only)
router.get('/rules',        requireRole('Admin'),   ctrl.getRules);
router.post('/rules',       requireRole('Admin'),   ctrl.createRule);
router.put('/rules/:id',    requireRole('Admin'),   ctrl.updateRule);
router.delete('/rules/:id', requireRole('Admin'),   ctrl.deleteRule);

// Scan - run rules against aged claims
router.post('/scan',        requireRole('Admin'),   ctrl.scan);

// Approval queue (Manager+)
router.get('/queue',              requireRole('Manager'), ctrl.getQueue);
router.get('/queue-stats',        requireRole('Manager'), ctrl.getQueueStats);
router.put('/queue/bulk-approve', requireRole('Manager'), ctrl.bulkApprove);
router.put('/queue/bulk-reject',  requireRole('Manager'), ctrl.bulkReject);
router.put('/queue/:id/approve',  requireRole('Manager'), ctrl.approveRequest);
router.put('/queue/:id/reject',   requireRole('Manager'), ctrl.rejectRequest);
router.put('/queue/:id/reopen',   requireRole('Manager'), ctrl.reopenRequest);
router.put('/queue/:id',          requireRole('Manager'), ctrl.updateRequest);
router.delete('/queue/:id',       requireRole('Manager'), ctrl.deleteRequest);

// Manual write-off request (AR Specialist+)
router.post('/request',     requireRole('AR Specialist'), ctrl.createRequest);

// Audit log
// 'Manager', not 'manager': ROLE_HIERARCHY is keyed on the display name and
// requireRole fails closed on anything it does not recognise. Lowercase here
// meant this route denied every caller, Super Admin included.
router.get('/audit',        requireRole('Manager'), ctrl.getAuditLog);

export default router;
