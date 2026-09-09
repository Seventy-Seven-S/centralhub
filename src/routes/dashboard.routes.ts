// src/routes/dashboard.routes.ts
import { Router } from 'express';
import dashboardController from '../controllers/dashboard.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

// KPIs del NEGOCIO (ingresos, egresos, diferencia, ingresos por mes) — solo
// ADMIN. Las secretarias trabajan con clientes enfrente y tenían estos montos
// en pantalla; esconderlos en la UI no bastaba porque el dato ya viajaba.
router.get('/summary', authorize('ADMIN'), dashboardController.getSummary.bind(dashboardController));

// Dashboard de trabajo: sus cobros del día y sus pendientes, sin totales del
// negocio. Es lo que ve un MANAGER.
router.get('/operativo', authorize('ADMIN', 'MANAGER'), dashboardController.getOperativo.bind(dashboardController));

// Detalle de cuotas vencidas sin pagar — operativo, lo necesitan para cobrar.
router.get('/mora', authorize('ADMIN', 'MANAGER'), dashboardController.getMoraDetail.bind(dashboardController));

export default router;
