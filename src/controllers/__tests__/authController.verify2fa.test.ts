import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    refreshToken: { create: vi.fn() },
  };
  const bcrypt = { compare: vi.fn(), hash: vi.fn() };
  const sendVerificationCode = vi.fn();
  return { prisma, bcrypt, sendVerificationCode };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));
vi.mock('bcrypt', () => ({ default: mocks.bcrypt }));
vi.mock('../../services/email.service', () => ({ sendVerificationCode: mocks.sendVerificationCode }));

import { verify2fa, login, generarCodigo2fa, MAX_INTENTOS_2FA } from '../auth.controller';

const USER = {
  id: 'user-1', email: 'secretaria@centralinmob.com', firstName: 'María', lastName: 'López',
  password: 'hashed-pw', role: 'MANAGER', status: 'ACTIVE',
  twoFactorCode: 'hashed-code', twoFactorExpiry: new Date(Date.now() + 5 * 60_000), twoFactorAttempts: 0,
};

function run(handler: unknown, body: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn();
  (handler as (r: Request, s: Response, n: () => void) => void)({ body } as Request, res, next);
  return { res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = 'production';
  mocks.prisma.user.findUnique.mockResolvedValue(USER);
  mocks.prisma.user.update.mockResolvedValue({ twoFactorAttempts: 1 });
  mocks.prisma.refreshToken.create.mockResolvedValue({});
  mocks.bcrypt.compare.mockResolvedValue(false);
  mocks.bcrypt.hash.mockResolvedValue('hashed-code');
  mocks.sendVerificationCode.mockResolvedValue(undefined);
});

afterEach(() => { vi.restoreAllMocks(); });

describe('generarCodigo2fa — criptográfico y de 6 dígitos', () => {
  it('no usa Math.random y siempre da 6 dígitos entre 100000 y 999999', () => {
    const spy = vi.spyOn(Math, 'random');
    for (let i = 0; i < 500; i++) {
      const c = generarCodigo2fa();
      expect(c).toMatch(/^\d{6}$/);
      expect(Number(c)).toBeGreaterThanOrEqual(100000);
      expect(Number(c)).toBeLessThanOrEqual(999999);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('login guarda el código nuevo con el contador de intentos en cero', async () => {
    mocks.bcrypt.compare.mockResolvedValue(true);
    const { res } = run(login, { email: USER.email, password: 'correcta' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { twoFactorCode: 'hashed-code', twoFactorExpiry: expect.any(Date), twoFactorAttempts: 0 },
    });
  });
});

describe('verify2fa — el código se quema al quinto fallo', () => {
  it('fallo normal: suma un intento de forma atómica y responde código inválido', async () => {
    const { next } = run(verify2fa, { email: USER.email, code: '123456' });
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400, message: 'Invalid verification code' });
    expect(mocks.prisma.user.update).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { twoFactorAttempts: { increment: 1 } },
      select: { twoFactorAttempts: true },
    });
  });

  it(`al fallo número ${MAX_INTENTOS_2FA}: borra el código y pide iniciar sesión otra vez`, async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...USER, twoFactorAttempts: MAX_INTENTOS_2FA - 1 });
    mocks.prisma.user.update.mockResolvedValueOnce({ twoFactorAttempts: MAX_INTENTOS_2FA });

    const { next } = run(verify2fa, { email: USER.email, code: '123456' });
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400 });
    expect(next.mock.calls[0][0].message).toMatch(/demasiados intentos/i);
    expect(mocks.prisma.user.update).toHaveBeenLastCalledWith({
      where: { id: 'user-1' },
      data: { twoFactorCode: null, twoFactorExpiry: null },
    });
  });

  it('con los intentos ya agotados ni siquiera compara: el código correcto tampoco entra', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...USER, twoFactorAttempts: MAX_INTENTOS_2FA });
    mocks.bcrypt.compare.mockResolvedValue(true);

    const { next } = run(verify2fa, { email: USER.email, code: '123456' });
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(next.mock.calls[0][0].message).toMatch(/demasiados intentos/i);
    expect(mocks.bcrypt.compare).not.toHaveBeenCalled();
    expect(mocks.prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('código correcto antes del tope: entra y el contador vuelve a cero', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...USER, twoFactorAttempts: 3 });
    mocks.bcrypt.compare.mockResolvedValue(true);
    mocks.prisma.user.update.mockResolvedValue(USER);

    const { res } = run(verify2fa, { email: USER.email, code: '123456' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { twoFactorCode: null, twoFactorExpiry: null, twoFactorAttempts: 0, lastLogin: expect.any(Date) },
    });
  });
});
