import { Router } from 'express';
import { BulkPostController } from '../../../controllers/recon-iq/reconciliation/bulk-post';

const router = Router();
const ctrl = new BulkPostController();

router.post('/bulk-post', ctrl.bulkPost);

export default router;
