// src/routes/payment.routes.ts
import { Router } from 'express';
import paymentController from '../controllers/payment.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.post('/', paymentController.create);
router.get('/', paymentController.getAll);
router.get('/:id', paymentController.getById);
router.put('/:id', paymentController.update);

export default router;