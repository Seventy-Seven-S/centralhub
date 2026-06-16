import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError, asyncHandler } from '../middlewares/errorHandler';

const INTERNAL_ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'AGENT'];

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
  const { email, password, firstName, lastName, role } = req.body;

  if (!email || !password || !firstName || !lastName || !role)
    throw new ApiError(400, 'All fields are required');
  if (!INTERNAL_ROLES.includes(role))
    throw new ApiError(400, 'Invalid role');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(400, 'Email already registered');

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashed, firstName, lastName, role },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, createdAt: true },
  });

  res.status(201).json({ status: 'success', data: { user } });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { firstName, lastName, role } = req.body;

  if (role && !INTERNAL_ROLES.includes(role))
    throw new ApiError(400, 'Invalid role');

  const user = await prisma.user.update({
    where: { id },
    data: { ...(firstName && { firstName }), ...(lastName && { lastName }), ...(role && { role }) },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, createdAt: true },
  });

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
