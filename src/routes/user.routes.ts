import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { getUsers, getSellers, createUser, updateUser, toggleUserStatus } from '../controllers/user.controller';
import { asyncHandler } from '../middlewares/errorHandler';
import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { fusionarPreferencias } from '../services/lib/preferencias';

const router = Router();

// Ajustes de pantalla del usuario en sesión (orden de las tarjetas de
// Proyectos, etc.). Cualquier rol: son sus propios ajustes, no datos del
// negocio. Van antes de "/:id" para que Express no trate "mis-preferencias"
// como un id de usuario.
router.get('/mis-preferencias', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const u = await prisma.user.findUnique({
    where: { id: req.user!.userId }, select: { preferencias: true },
  });
  res.json({ success: true, data: u?.preferencias ?? {} });
}));

router.put('/mis-preferencias', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const cuerpo = req.body;
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    res.status(400).json({ success: false, message: 'Se esperaba un objeto de preferencias' });
    return;
  }
  // Se fusiona con lo guardado: enviar una preferencia no debe borrar las otras.
  const actual = await prisma.user.findUnique({
    where: { id: req.user!.userId }, select: { preferencias: true },
  });
  const preferencias = fusionarPreferencias(actual?.preferencias, cuerpo);
  // Prisma tipa el campo Json con su propio tipo de entrada; el objeto que
  // armamos es JSON válido por construcción.
  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { preferencias: preferencias as Prisma.InputJsonValue },
  });
  res.json({ success: true, data: preferencias });
}));

// Vendedores asignables (AGENT, MANAGER) — ADMIN y MANAGER pueden consultarlo.
// Debe ir antes de cualquier ruta con parámetro para no colisionar.
router.get('/sellers',      authenticate, authorize('ADMIN', 'MANAGER'), getSellers);
router.get('/',             authenticate, authorize('ADMIN'), getUsers);
router.post('/',            authenticate, authorize('ADMIN'), createUser);
router.put('/:id',          authenticate, authorize('ADMIN'), updateUser);
router.patch('/:id/status', authenticate, authorize('ADMIN'), toggleUserStatus);

export default router;
