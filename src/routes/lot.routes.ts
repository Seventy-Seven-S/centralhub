// src/routes/lot.routes.ts
import { Router } from 'express';
import lotController from '../controllers/lot.controller';
import { authenticate } from '../middlewares/auth';
const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// CRUD de lotes
router.post('/', lotController.create);
router.get('/', lotController.getAll);
router.get('/:id', lotController.getById);
router.put('/:id', lotController.update);

// Apartados
router.post('/:id/reserve', lotController.reserve);
router.delete('/:id/reserve', lotController.releaseReservation);

export default router;