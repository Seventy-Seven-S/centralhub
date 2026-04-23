// src/routes/contract.routes.ts
import { Router } from 'express';
import contractController from '../controllers/contract.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// CRUD de contratos
router.post('/', contractController.create);
router.get('/', contractController.getAll);
router.get('/:id', contractController.getById);
router.put('/:id', contractController.update);

// Co-titulares
router.post('/:id/coowners', contractController.addCoOwner);

export default router;