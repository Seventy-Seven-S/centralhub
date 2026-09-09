// src/routes/corteDiario.routes.ts — entrega diaria del efectivo al administrador
import { Router } from 'express';
import corteDiarioController from '../controllers/corteDiario.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();
router.use(authenticate);

const cobra = authorize('ADMIN', 'MANAGER', 'AGENT');

// "mi-dia" antes que "/:id" para que no lo capture la ruta con parámetro.
router.get('/mi-dia', cobra, corteDiarioController.miDia);
router.get('/',       cobra, corteDiarioController.listar);   // MANAGER ve solo los suyos
router.post('/',      cobra, corteDiarioController.cerrar);
router.get('/:id',    cobra, corteDiarioController.obtener);

// Recibir el dinero es de quien lo custodia, no de quien lo cobró. El servicio
// además impide recibir el corte propio aunque el rol sea ADMIN.
router.post('/:id/recibir', authorize('ADMIN'), corteDiarioController.recibir);

export default router;
