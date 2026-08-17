import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const prisma = { user: { findUnique: vi.fn(), update: vi.fn() } };
  const bcrypt = { compare: vi.fn(), hash: vi.fn() };
  const sendVerificationCode = vi.fn();
  return { prisma, bcrypt, sendVerificationCode };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));
vi.mock('bcrypt', () => ({ default: mocks.bcrypt }));
vi.mock('../../services/email.service', () => ({ sendVerificationCode: mocks.sendVerificationCode }));

import { login } from '../auth.controller';
import { EmailSendError } from '../../utils/errors';

const USER = {
  id: 'user-1', email: 'secretaria@centralinmob.com', firstName: 'María',
  password: 'hashed-pw', role: 'MANAGER', status: 'ACTIVE',
};

function runLogin(body: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn();
  (login as unknown as (r: Request, s: Response, n: () => void) => void)({ body } as Request, res, next);
  return { res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = 'production'; // fuerza el flujo de 2FA (no el atajo de dev)
  mocks.prisma.user.findUnique.mockResolvedValue(USER);
  mocks.prisma.user.update.mockResolvedValue(USER);
  mocks.bcrypt.compare.mockResolvedValue(true);
  mocks.sendVerificationCode.mockResolvedValue(undefined);
});

describe('login — envío de 2FA falla → NO responde pending_2fa en falso', () => {
  it('sendVerificationCode lanza EmailSendError → login se bloquea con error claro, no pending_2fa', async () => {
    mocks.sendVerificationCode.mockRejectedValue(new EmailSendError('No se pudo enviar el código de verificación.', 'domain not verified'));

    const { next } = runLogin({ email: USER.email, password: 'correcta' });
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(502);
    expect(err.message).toMatch(/no se pudo enviar.*código.*administrador/i);
    expect(err.message).not.toMatch(/domain not verified/i); // no filtra detalle interno al usuario
  });

  it('el error de envío es distinto del error de credenciales inválidas (distinta acción, distinto mensaje)', async () => {
    mocks.bcrypt.compare.mockResolvedValue(false); // credenciales malas
    const { next } = runLogin({ email: USER.email, password: 'incorrecta' });
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/invalid credentials/i);
    expect(mocks.sendVerificationCode).not.toHaveBeenCalled(); // ni siquiera se intentó
  });

  it('envío exitoso → sigue respondiendo pending_2fa como hoy', async () => {
    const { res, next } = runLogin({ email: USER.email, password: 'correcta' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending_2fa', data: { email: USER.email } }),
    );
  });

  it('un error de envío que NO es EmailSendError (bug real) no se disfraza — se propaga tal cual', async () => {
    mocks.sendVerificationCode.mockRejectedValue(new Error('boom inesperado'));
    const { next } = runLogin({ email: USER.email, password: 'correcta' });
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(next.mock.calls[0][0].message).toBe('boom inesperado');
  });
});
