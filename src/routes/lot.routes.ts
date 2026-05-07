// src/routes/lot.routes.ts
import { Router } from 'express';
import lotController from '../controllers/lot.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

const adminOrManager = authorize('ADMIN', 'MANAGER');

// Lectura — todos los roles autenticados pueden ver lotes
router.get('/',    lotController.getAll);
router.get('/:id', lotController.getById);

// Escritura — solo ADMIN y MANAGER
router.post('/',   adminOrManager, lotController.create);
router.put('/:id', adminOrManager, lotController.update);

// Apartados — solo ADMIN y MANAGER
router.post('/:id/reserve',   adminOrManager, lotController.reserve);
router.delete('/:id/reserve', adminOrManager, lotController.releaseReservation);

export default router;
