import { Router } from 'express';
import { WebhooksController } from '../../controllers/api/webhooks';
import { requireRole } from '../../middleware/require-role';

const router = Router();
const ctrl = new WebhooksController();

router.get('/subscriptions',         requireRole('Admin'), ctrl.listSubscriptions);
router.post('/subscriptions',        requireRole('Admin'), ctrl.createSubscription);
router.delete('/subscriptions/:id',  requireRole('Admin'), ctrl.deleteSubscription);
router.get('/subscriptions/:id/deliveries', requireRole('Admin'), ctrl.getDeliveries);
router.get('/event-types',           requireRole('Admin'), ctrl.getEventTypes);

export default router;
