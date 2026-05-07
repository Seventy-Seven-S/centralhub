// src/routes/cuota.routes.ts
import { Router } from 'express';
import cuotaController from '../controllers/cuota.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

const adminOrManager = authorize('ADMIN', 'MANAGER');

// Lista cuotas filtradas por proyecto y/o status
router.get('/', adminOrManager, cuotaController.getAll.bind(cuotaController));

// Marca una cuota como pagada
router.patch('/:id/pay', adminOrManager, cuotaController.pay.bind(cuotaController));

export default router;
