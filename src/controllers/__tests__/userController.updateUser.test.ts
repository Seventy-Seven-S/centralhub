import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
  };
  return { prisma };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));

import { updateUser, toggleUserStatus } from '../user.controller';

const EXISTENTE = {
  id: 'brianda-id', email: 'briandadelangel@gmail.com',
  firstName: 'Brianda', lastName: 'Del Angel', role: 'MANAGER', status: 'ACTIVE', createdAt: new Date(),
};

function runController(id: string, body: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn();
  (updateUser as any)({ params: { id }, body } as unknown as Request, res, next);
  return { res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.user.update.mockResolvedValue({ ...EXISTENTE, email: 'briandadelangel6@gmail.com' });
  mocks.prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
});

describe('updateUser — cambio de correo', () => {
  it('normaliza a minúsculas conservando el punto de Gmail y guarda el email', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null); // nadie más lo tiene

    const { res, next } = runController('brianda-id', { email: 'BriandaDelAngel6@Gmail.com' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(next).not.toHaveBeenCalled();
    expect(mocks.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'brianda-id' },
        data: expect.objectContaining({ email: 'briandadelangel6@gmail.com' }),
      }),
    );
  });

  it('revoca las sesiones activas del usuario cuando cambia el correo', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);

    const { res } = runController('brianda-id', { email: 'briandadelangel6@gmail.com' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'brianda-id' } });
  });

  it('NO revoca sesiones si la petición no trae email (solo nombre/rol)', async () => {
    const { res } = runController('brianda-id', { firstName: 'Brianda' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(mocks.prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ email: expect.anything() }) }),
    );
  });

  it('rechaza un correo que ya pertenece a OTRO usuario', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'otro-id' });

    const { next } = runController('brianda-id', { email: 'marisol@gmail.com' });
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400 });
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('acepta que el usuario "repita" su propio correo (no es duplicado)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'brianda-id' });

    const { res, next } = runController('brianda-id', { email: 'briandadelangel@gmail.com' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(next).not.toHaveBeenCalled();
    expect(mocks.prisma.user.update).toHaveBeenCalled();
  });

  it('rechaza un correo con formato inválido', async () => {
    const { next } = runController('brianda-id', { email: 'no-es-un-correo' });
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400 });
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('updateUser — cambio de rol', () => {
  it('si el rol cambia, revoca sus sesiones para que no siga renovando con el rol viejo', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'MANAGER' });
    mocks.prisma.user.update.mockResolvedValue({ ...EXISTENTE, role: 'AGENT' });

    const { res } = runController('brianda-id', { role: 'AGENT' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'brianda-id' } });
  });

  it('si el formulario manda el MISMO rol (solo se corrigió el nombre), no la saca del sistema', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'MANAGER' });
    mocks.prisma.user.update.mockResolvedValue(EXISTENTE);

    const { res } = runController('brianda-id', { firstName: 'Brianda', role: 'MANAGER' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(mocks.prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });
});

describe('toggleUserStatus — desactivar corta la sesión', () => {
  function runToggle(id: string) {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
    const next = vi.fn();
    (toggleUserStatus as any)({ params: { id } } as unknown as Request, res, next);
    return { res, next };
  }

  it('ACTIVE → INACTIVE: borra sus refresh tokens', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    mocks.prisma.user.update.mockResolvedValue({ ...EXISTENTE, status: 'INACTIVE' });

    const { res } = runToggle('brianda-id');
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(mocks.prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'INACTIVE' } }));
    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'brianda-id' } });
  });

  it('INACTIVE → ACTIVE: no hay sesiones que cortar', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ status: 'INACTIVE' });
    mocks.prisma.user.update.mockResolvedValue(EXISTENTE);

    const { res } = runToggle('brianda-id');
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(mocks.prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });
});
