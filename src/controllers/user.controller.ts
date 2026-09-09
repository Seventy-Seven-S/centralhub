import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError, asyncHandler } from '../middlewares/errorHandler';
import { normalizeEmail } from '../utils/normalizeEmail';
import { sendStaffWelcomeEmail } from '../services/email.service';

const INTERNAL_ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'AGENT'];

// Validación deliberadamente laxa: el correo real se prueba solo cuando llega
// el código 2FA. Aquí solo atajamos dedazos obvios (sin @, sin dominio).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Roles que pueden ser vendedores asignables a un contrato/apartado.
const SELLER_ROLES: UserRole[] = ['AGENT', 'MANAGER'];

// GET /users/sellers — vendedores activos (AGENT, MANAGER) para asignar en
// contratos/apartados. Accesible a ADMIN y MANAGER (no solo ADMIN como /users).
// Devuelve solo campos mínimos para poblar el selector.
export const getSellers = asyncHandler(async (_req: Request, res: Response) => {
  const sellers = await prisma.user.findMany({
    where: { role: { in: SELLER_ROLES }, status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  res.json({ status: 'success', data: { sellers } });
});

export const getUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    where: { role: { in: INTERNAL_ROLES } },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      role: true, status: true, lastLogin: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ status: 'success', data: { users } });
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { password, firstName, lastName, role } = req.body;

  if (!req.body.email || !password || !firstName || !lastName || !role)
    throw new ApiError(400, 'All fields are required');
  if (!INTERNAL_ROLES.includes(role))
    throw new ApiError(400, 'Invalid role');

  const email = normalizeEmail(req.body.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(400, 'Email already registered');

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashed, firstName, lastName, role },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, createdAt: true },
  });

  // Sus credenciales por correo. No bloquea el alta: si Resend falla, el
  // usuario ya existe y el admin tiene la contraseña porque él la escribió.
  sendStaffWelcomeEmail(user.email, user.firstName, user.role, password)
    .catch(err => console.error('Error enviando email de bienvenida a usuario interno:', err));

  res.status(201).json({ status: 'success', data: { user } });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { firstName, lastName, role } = req.body;

  if (role && !INTERNAL_ROLES.includes(role))
    throw new ApiError(400, 'Invalid role');

  // El correo es la identidad de login Y el destino del código 2FA, así que
  // cambiarlo pasa por la misma normalización que usa el login para buscar al
  // usuario — si aquí se guardara distinto, la cuenta quedaría inaccesible.
  let email: string | undefined;
  if (req.body.email !== undefined) {
    email = normalizeEmail(req.body.email);
    if (!EMAIL_RE.test(email)) throw new ApiError(400, 'Email inválido');

    // Que el propio usuario "repita" su correo no es un duplicado.
    const owner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (owner && owner.id !== id) throw new ApiError(400, 'Email already registered');
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(role && { role }),
      ...(email && { email }),
    },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, createdAt: true },
  });

  // Los JWT ya emitidos llevan el email viejo adentro. Al cambiar la identidad
  // se revocan las sesiones para que el usuario vuelva a entrar con la nueva.
  if (email) await prisma.refreshToken.deleteMany({ where: { userId: id } });

  res.json({ status: 'success', data: { user } });
});

export const toggleUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const current = await prisma.user.findUnique({ where: { id }, select: { status: true } });
  if (!current) throw new ApiError(404, 'User not found');

  const newStatus = current.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const user = await prisma.user.update({
    where: { id },
    data: { status: newStatus },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true },
  });

  res.json({ status: 'success', data: { user } });
});
