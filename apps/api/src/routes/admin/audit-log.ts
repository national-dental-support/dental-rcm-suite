import { Router } from 'express';
import { AuditLogController } from '../../controllers/admin/audit-log';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new AuditLogController();

router.get('/', requireRole('Admin'), ctrl.list);

export default router;
