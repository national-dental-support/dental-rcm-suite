import express from 'express';
import { ClaimAuditLogController } from '../../controllers/admin/claim-audit-log';
import { requireRole } from '../../middleware/require-role';

const router = express.Router();
const ctrl   = new ClaimAuditLogController();

router.get('/', requireRole('Super Admin'), ctrl.list);

export default router;
