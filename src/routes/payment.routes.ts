// src/routes/payment.routes.ts
import { Router, type Request, type Response } from 'express';
import paymentController from '../controllers/payment.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/errorHandler';
import { recibosConEnvioFallido, reenviarRecibo } from '../services/reciboLog.service';

const router = Router();

router.use(authenticate);

const adminOrManager = authorize('ADMIN', 'MANAGER');
const soloAdmin = authorize('ADMIN');

// Recibos cuyo correo no llegó. Solo ADMIN: es información de operación del
// negocio, no de atención al cliente en ventanilla.
router.get('/recibos/fallidos', soloAdmin, asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: await recibosConEnvioFallido() });
}));

// Reenviar. Acepta un correo distinto: el fallo más común es una dirección mal
// capturada, y obligar a re-registrar el pago para corregirla sería absurdo.
router.post('/recibos/:id/reenviar', soloAdmin, asyncHandler(async (req: Request, res: Response) => {
  const estado = await reenviarRecibo(req.params.id, req.body?.email);
  res.json({ success: true, data: { estado } });
}));

router.post('/',   adminOrManager, paymentController.create);
router.get('/',    adminOrManager, paymentController.getAll);
router.get('/:id/recibo', adminOrManager, paymentController.getRecibo);
router.get('/:id', adminOrManager, paymentController.getById);
router.put('/:id', adminOrManager, paymentController.update);

export default router;
