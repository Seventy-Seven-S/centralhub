// src/routes/payment.routes.ts
import { Router } from 'express';
import paymentController from '../controllers/payment.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

const adminOrManager = authorize('ADMIN', 'MANAGER');

router.post('/',   adminOrManager, paymentController.create);
router.get('/',    adminOrManager, paymentController.getAll);
router.get('/:id', adminOrManager, paymentController.getById);
router.put('/:id', adminOrManager, paymentController.update);

export default router;
