import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const prisma = { user: { findUnique: vi.fn(), create: vi.fn() } };
  const bcrypt = { hash: vi.fn() };
  const sendStaffWelcomeEmail = vi.fn();
  return { prisma, bcrypt, sendStaffWelcomeEmail };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));
vi.mock('bcrypt', () => ({ default: mocks.bcrypt }));
vi.mock('../../services/email.service', () => ({ sendStaffWelcomeEmail: mocks.sendStaffWelcomeEmail }));

import { createUser } from '../user.controller';

function runController(body: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn();
  (createUser as any)({ body } as Request, res, next);
  return { res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bcrypt.hash.mockResolvedValue('hashed-pw');
  mocks.sendStaffWelcomeEmail.mockResolvedValue(undefined);
});

describe('createUser (endpoint de admin /users) — misma normalización de email que login usa para buscar', () => {
  it('email con punto en Gmail y mayúsculas → se busca duplicado y se guarda en minúsculas, punto intacto', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.create.mockResolvedValue({
      id: 'new-id', email: 'remocas.mat@gmail.com', firstName: 'Marisol', lastName: 'Mendoza', role: 'MANAGER', status: 'ACTIVE', createdAt: new Date(),
    });

    const { res, next } = runController({
      email: 'Remocas.Mat@Gmail.com', password: 'temp-pw', firstName: 'Marisol', lastName: 'Mendoza', role: 'MANAGER',
    });
    await vi.waitFor(() => expect(res.status).toHaveBeenCalled());

    expect(next).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'remocas.mat@gmail.com' } });
    expect(mocks.prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'remocas.mat@gmail.com' }) }),
    );
  });
});

describe('createUser — correo de bienvenida', () => {
  it('manda las credenciales al correo ya normalizado, con la contraseña en claro (no el hash)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.create.mockResolvedValue({
      id: 'arq-id', email: 'arquitecto@example.com', firstName: 'Alberto', lastName: 'Ruiz', role: 'ADMIN', status: 'ACTIVE', createdAt: new Date(),
    });

    const { res } = runController({
      email: 'Arquitecto@Example.com', password: 'Tmp#2026abc', firstName: 'Alberto', lastName: 'Ruiz', role: 'ADMIN',
    });
    await vi.waitFor(() => expect(res.status).toHaveBeenCalled());

    expect(mocks.sendStaffWelcomeEmail).toHaveBeenCalledWith(
      'arquitecto@example.com', 'Alberto', 'ADMIN', 'Tmp#2026abc',
    );
  });

  it('si el envío falla, el alta NO se cae: el usuario ya existe', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.create.mockResolvedValue({
      id: 'arq-id', email: 'arq@example.com', firstName: 'Alberto', lastName: 'Ruiz', role: 'ADMIN', status: 'ACTIVE', createdAt: new Date(),
    });
    mocks.sendStaffWelcomeEmail.mockRejectedValue(new Error('Resend caído'));

    const { res, next } = runController({
      email: 'arq@example.com', password: 'Tmp#1', firstName: 'Alberto', lastName: 'Ruiz', role: 'ADMIN',
    });
    await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(201));

    expect(next).not.toHaveBeenCalled();
  });
});
