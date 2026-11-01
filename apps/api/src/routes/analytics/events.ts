import { Router } from 'express';
import { analyticsEventsController } from '../../controllers/analytics/events';

const router = Router();

router.post('/track', analyticsEventsController.trackEvent);
router.post('/error', analyticsEventsController.trackError);

export default router;
