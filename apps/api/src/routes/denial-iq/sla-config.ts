import express from 'express';
import { getSlaConfig, upsertSlaConfig, getSlaViolations, getSlaSummary } from '../../controllers/denial-iq/sla-config';
import { requireRole } from '../../middleware/require-role';

const router = express.Router();

router.get('/config',     getSlaConfig);
router.put('/config',     requireRole('Admin'), upsertSlaConfig);
router.get('/violations', getSlaViolations);
router.get('/summary',    getSlaSummary);

export default router;
