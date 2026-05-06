// src/routes/cuota.routes.ts
import { Router } from 'express';
import cuotaController from '../controllers/cuota.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

// Lista cuotas filtradas por proyecto y/o status
router.get('/', cuotaController.getAll.bind(cuotaController));

// Marca una cuota como pagada
router.patch('/:id/pay', cuotaController.pay.bind(cuotaController));

export default router;
