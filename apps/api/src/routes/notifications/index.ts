import express from 'express';
import { NotificationsController } from '../../controllers/notifications/index';

const router = express.Router();
const ctrl = new NotificationsController();

router.get('/', ctrl.list);
router.get('/unread-count', ctrl.unreadCount);
router.put('/:id/read', ctrl.markRead);
router.put('/read-all', ctrl.markAllRead);

export default router;
