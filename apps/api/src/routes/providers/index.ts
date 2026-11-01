import { Router } from 'express';
import { providersController } from '../../controllers/providers';

const router = Router();

// GET /api/providers - return all provider names
router.get('/', providersController.get);

export default router;
