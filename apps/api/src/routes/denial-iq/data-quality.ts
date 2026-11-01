import express from 'express';
import {
  listQuarantined, resolveQuarantined,
  listDuplicates, resolveDuplicate,
  getDataQualityStats, listLateArriving,
} from '../../controllers/denial-iq/data-quality';
import { requireRole } from '../../middleware/require-role';

const router = express.Router();

router.get('/quarantine',        listQuarantined);
router.patch('/quarantine/:id',  requireRole('Manager'), resolveQuarantined);
router.get('/duplicates',        listDuplicates);
router.patch('/duplicates/:id',  requireRole('Manager'), resolveDuplicate);
router.get('/stats',             getDataQualityStats);
router.get('/late-arriving',     listLateArriving);

export default router;
