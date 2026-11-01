import express from 'express';
import { getOrgHierarchy, listMso, createMso, listRegions, createRegion, listDepartments, createDepartment } from '../../controllers/denial-iq/org-hierarchy';
import { requireRole } from '../../middleware/require-role';

const router = express.Router();

router.get('/',             getOrgHierarchy);
router.get('/mso',          listMso);
router.post('/mso',         requireRole('Admin'), createMso);
router.get('/regions',      listRegions);
router.post('/regions',     requireRole('Admin'), createRegion);
router.get('/departments',  listDepartments);
router.post('/departments', requireRole('Admin'), createDepartment);

export default router;
