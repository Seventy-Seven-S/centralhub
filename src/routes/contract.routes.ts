// src/routes/contract.routes.ts
import { Router } from 'express';
import contractController from '../controllers/contract.controller';
import cuotaController from '../controllers/cuota.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

const adminOrManager = authorize('ADMIN', 'MANAGER');

// CRUD de contratos
router.post('/',    adminOrManager, contractController.create);
router.get('/',     adminOrManager, contractController.getAll);
router.get('/:id',  adminOrManager, contractController.getById);
router.put('/:id',  adminOrManager, contractController.update);

// Co-titulares
router.post('/:id/coowners', adminOrManager, contractController.addCoOwner);

// Cuotas del contrato
router.get('/:id/cuotas', adminOrManager, cuotaController.getByContract.bind(cuotaController));

export default router;
