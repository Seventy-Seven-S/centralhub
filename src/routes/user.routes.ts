import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { getUsers, getSellers, createUser, updateUser, toggleUserStatus } from '../controllers/user.controller';

const router = Router();

// Vendedores asignables (AGENT, MANAGER) — ADMIN y MANAGER pueden consultarlo.
// Debe ir antes de cualquier ruta con parámetro para no colisionar.
router.get('/sellers',      authenticate, authorize('ADMIN', 'MANAGER'), getSellers);
router.get('/',             authenticate, authorize('ADMIN'), getUsers);
router.post('/',            authenticate, authorize('ADMIN'), createUser);
router.put('/:id',          authenticate, authorize('ADMIN'), updateUser);
router.patch('/:id/status', authenticate, authorize('ADMIN'), toggleUserStatus);

export default router;
