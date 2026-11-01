import { Router } from 'express';
import { lookupsController } from '../../controllers/lookups/lookups';

const router = Router();

router.post('/locations-and-groups', lookupsController.locationsAndGroups);
router.post('/providers', lookupsController.providers);

export default router;
