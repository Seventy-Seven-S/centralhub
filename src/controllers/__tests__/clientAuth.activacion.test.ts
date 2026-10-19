import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const prisma = {
    clientUser: { findUnique: vi.fn(), update: vi.fn() },
    clientRefreshToken: { create: vi.fn() },
  };
  const bcrypt = { compare: vi.fn(), hash: vi.fn() };
  const servicio = { activarCuentaPortal: vi.fn() };
  return { prisma, bcrypt, servicio };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));
vi.mock('bcrypt', () => ({ default: mocks.bcrypt }));
vi.mock('../../services/portalAcceso.service', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/portalAcceso.service')>();
  return { ...real, activarCuentaPortal: mocks.servicio.activarCuentaPortal };
});

import { loginClient, activateClientAccount, changeClientPasswordForUser } from '../clientAuth.controller';
import { EnlaceActivacionError } from '../../services/portalAcceso.service';

function correr(handler: any, body: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn();
  handler({ body } as Request, res, next);
  return { res, next };
}

const CUENTA = {
  id: 'cu-1', email: 'ana@correo.com', password: 'hash', status: 'ACTIVE',
  client: { id: 'c-1', globalCode: 'CLI-1', firstName: 'Ana', lastName: 'Pérez', phone: '5551234567', email: 'ana@correo.com' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bcrypt.compare.mockResolvedValue(true);
  mocks.prisma.clientUser.findUnique.mockResolvedValue(CUENTA);
  mocks.prisma.clientUser.update.mockResolvedValue({});
  mocks.prisma.clientRefreshToken.create.mockResolvedValue({});
});

describe('loginClient — contraseña vieja adivinable', () => {
  it('con la fórmula vieja entra, pero con mustChangePassword=true', async () => {
    const { res } = correr(loginClient, { email: 'ana@correo.com', password: 'pére4567' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());
    expect((res.json as any).mock.calls[0][0].data.mustChangePassword).toBe(true);
    expect((res.json as any).mock.calls[0][0].data.accessToken).toBeTruthy();
  });

  it('con Central2024 también', async () => {
    const { res } = correr(loginClient, { email: 'ana@correo.com', password: 'Central2024' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());
    expect((res.json as any).mock.calls[0][0].data.mustChangePassword).toBe(true);
  });

  it('con una contraseña propia → mustChangePassword=false', async () => {
    const { res } = correr(loginClient, { email: 'ana@correo.com', password: 'MiCasaVerde2026' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());
    expect((res.json as any).mock.calls[0][0].data.mustChangePassword).toBe(false);
  });

  it('contraseña incorrecta sigue siendo 401 aunque parezca la fórmula', async () => {
    mocks.bcrypt.compare.mockResolvedValue(false);
    const { next } = correr(loginClient, { email: 'ana@correo.com', password: 'pére4567' });
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });
});

describe('changeClientPasswordForUser — no deja volver a la fórmula vieja', () => {
  it('rechaza apellido+teléfono como contraseña nueva', async () => {
    await expect(changeClientPasswordForUser('cu-1', 'pére4567', 'Central2024')).rejects.toMatchObject({ statusCode: 400 });
    await expect(changeClientPasswordForUser('cu-1', 'x', 'pére4567')).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.prisma.clientUser.update).not.toHaveBeenCalled();
  });
});

describe('POST /client-auth/activar', () => {
  it('éxito → 200', async () => {
    mocks.servicio.activarCuentaPortal.mockResolvedValue(undefined);
    const { res } = correr(activateClientAccount, { token: 'tok', password: 'nuevaClave1' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());
    expect(mocks.servicio.activarCuentaPortal).toHaveBeenCalledWith('tok', 'nuevaClave1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it.each([
    ['VENCIDO', 410],
    ['USADO', 410],
    ['INVALIDO', 400],
    ['SUSPENDIDA', 403],
  ] as const)('enlace %s → %i con el código para la pantalla', async (codigo, status) => {
    mocks.servicio.activarCuentaPortal.mockRejectedValue(new EnlaceActivacionError(codigo, 'msg'));
    const { res } = correr(activateClientAccount, { token: 'tok', password: 'nuevaClave1' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());
    expect(res.status).toHaveBeenCalledWith(status);
    expect((res.json as any).mock.calls[0][0]).toMatchObject({ codigo });
  });

  it('otros errores (contraseña corta) pasan al manejador general', async () => {
    const err = Object.assign(new Error('corta'), { statusCode: 400 });
    mocks.servicio.activarCuentaPortal.mockRejectedValue(err);
    const { next } = correr(activateClientAccount, { token: 'tok', password: 'x' });
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(err));
  });
});
