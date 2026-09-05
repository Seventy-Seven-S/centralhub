// src/routes/corte.routes.ts — cortes de ingresos (entrega al dueño del terreno)
import { Router } from 'express';
import corteController from '../controllers/corte.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();
router.use(authenticate);
const adminOrManager = authorize('ADMIN', 'MANAGER');

router.get('/pendientes', adminOrManager, corteController.pendientes);   // ?projectId=
router.get('/',           adminOrManager, corteController.listar);       // ?projectId=
router.post('/',          adminOrManager, corteController.crear);
router.get('/:id',        adminOrManager, corteController.obtener);

export default router;
