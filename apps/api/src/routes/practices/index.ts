import { Router } from 'express';
import { practicesController } from '../../controllers/practices';

const router = Router();

// GET /api/practices - return all practice names
router.get('/', practicesController.get);

export default router;
