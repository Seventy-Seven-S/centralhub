// src/routes/dashboard.routes.ts
import { Router } from 'express';
import dashboardController from '../controllers/dashboard.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.use(authenticate);
router.use(authorize('ADMIN', 'MANAGER'));

// KPIs generales (opcionalmente filtrado por proyecto)
router.get('/summary', dashboardController.getSummary.bind(dashboardController));

// Detalle de cuotas vencidas sin pagar
router.get('/mora', dashboardController.getMoraDetail.bind(dashboardController));

export default router;
