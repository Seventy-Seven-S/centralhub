// src/routes/notification.routes.ts
import { Router } from 'express';
import notificationController from '../controllers/notification.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Solo el ADMIN consume el buzón de notificaciones.
const adminOnly = authorize('ADMIN');

router.use(authenticate);

router.get('/', adminOnly, notificationController.getAll.bind(notificationController));
router.patch('/:id/read', adminOnly, notificationController.markRead.bind(notificationController));
router.post('/read-all', adminOnly, notificationController.markAllRead.bind(notificationController));

export default router;
