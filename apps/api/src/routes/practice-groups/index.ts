import express from 'express';
import { practiceGroupsController } from '../../controllers/practice-groups';

const router = express.Router();

router.post('/all', practiceGroupsController.get);

export default router;
