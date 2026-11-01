import { Router } from 'express';
import { SubscriptionsController } from '../../controllers/subscriptions/index';

const router = Router();
const ctrl = new SubscriptionsController();

router.get('/my-org',   ctrl.getMyOrg);
router.get('/products', ctrl.getProducts);

export default router;
