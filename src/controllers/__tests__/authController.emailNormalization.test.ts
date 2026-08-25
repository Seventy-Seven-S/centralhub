import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    refreshToken: { create: vi.fn() },
  };
  const bcrypt = { compare: vi.fn(), hash: vi.fn() };
  const sendVerificationCode = vi.fn();
  return { prisma, bcrypt, sendVerificationCode };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));
vi.mock('bcrypt', () => ({ default: mocks.bcrypt }));
vi.mock('../../services/email.service', () => ({ sendVerificationCode: mocks.sendVerificationCode }));

import { login, register } from '../auth.controller';

// Marisol, tal cual quedó guardada en producción: email con punto en la
// parte local de Gmail. Antes del fix, normalizeEmail() de
// express-validator lo mutaba a 'remocasmat@gmail.com' antes de llegar
// aquí — findUnique nunca encontraba al usuario y el login fallaba con
// 401 "Invalid credentials" SIN llegar a comparar la contraseña.
const MARISOL = {
  id: 'user-marisol', email: 'remocas.mat@gmail.com', firstName: 'Marisol',
  lastName: 'Mendoza', password: 'hashed-pw-real', role: 'MANAGER', status: 'ACTIVE',
};

function runController(fn: any, body: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn();
  fn({ body } as Request, res, next);
  return { res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = 'production';
  mocks.bcrypt.compare.mockResolvedValue(true);
  mocks.bcrypt.hash.mockResolvedValue('hashed-2fa-code');
  mocks.sendVerificationCode.mockResolvedValue(undefined);
  mocks.prisma.refreshToken.create.mockResolvedValue({});
});

describe('login — un email con punto en Gmail encuentra al usuario y valida su password (flujo completo)', () => {
  it('email tal cual (con punto) → findUnique lo busca SIN alterar el punto → bcrypt.compare corre con el hash real → pending_2fa', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(MARISOL);
    mocks.prisma.user.update.mockResolvedValue(MARISOL);

    const { res, next } = runController(login, { email: 'remocas.mat@gmail.com', password: 'o9fd8z%iN9Yv' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(next).not.toHaveBeenCalled();
    // La búsqueda debe usar el email con el punto intacto — findUnique con
    // 'remocasmat@gmail.com' (punto eliminado) sería el bug reproducido.
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'remocas.mat@gmail.com' } });
    expect(mocks.bcrypt.compare).toHaveBeenCalledWith('o9fd8z%iN9Yv', MARISOL.password);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending_2fa', data: { email: MARISOL.email } }),
    );
  });

  it('email con mayúsculas y espacios → se normaliza a minúsculas/trim antes de buscar (case-insensitive)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(MARISOL);
    mocks.prisma.user.update.mockResolvedValue(MARISOL);

    const { next } = runController(login, { email: '  Remocas.Mat@Gmail.com  ', password: 'o9fd8z%iN9Yv' });
    await vi.waitFor(() => expect(mocks.prisma.user.findUnique).toHaveBeenCalled());

    expect(next).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'remocas.mat@gmail.com' } });
  });
});

describe('register — guarda el email con la misma normalización que login usa para buscar', () => {
  it('email con punto en Gmail y mayúsculas → se guarda en minúsculas, punto intacto', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.create.mockResolvedValue({ ...MARISOL, id: 'new-id' });

    const { next } = runController(register, {
      email: 'Remocas.Mat@Gmail.com', password: 'pw', firstName: 'Marisol', lastName: 'Mendoza', role: 'MANAGER',
    });
    await vi.waitFor(() => expect(mocks.prisma.user.create).toHaveBeenCalled());

    expect(next).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'remocas.mat@gmail.com' } });
    expect(mocks.prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'remocas.mat@gmail.com' }) }),
    );
  });
});
