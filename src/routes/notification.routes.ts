// src/routes/notification.routes.ts
import { Router } from 'express';
import notificationController from '../controllers/notification.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Buzón de staff: ADMIN ("copia de todo") y MANAGER (apartados). El controller
// resuelve la audiencia según el rol del token.
const staffOnly = authorize('ADMIN', 'MANAGER');

router.use(authenticate);

router.get('/', staffOnly, notificationController.getAll.bind(notificationController));
router.patch('/:id/read', staffOnly, notificationController.markRead.bind(notificationController));
router.post('/read-all', staffOnly, notificationController.markAllRead.bind(notificationController));

export default router;
