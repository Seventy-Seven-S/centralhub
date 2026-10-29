import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    project: { count: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
  },
  bcrypt: { hash: vi.fn() },
  sendStaffWelcomeEmail: vi.fn(),
}));
vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));
vi.mock('bcrypt', () => ({ default: mocks.bcrypt }));
vi.mock('../../services/email.service', () => ({ sendStaffWelcomeEmail: mocks.sendStaffWelcomeEmail }));

import { createUser, updateUser } from '../user.controller';

async function correr(handler: any, req: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn();
  handler(req as Request, res, next);
  await vi.waitFor(() => expect((res.json as any).mock.calls.length + next.mock.calls.length).toBeGreaterThan(0));
  return { res, error: next.mock.calls[0]?.[0] };
}

const ALTA = { email: 'hermano@x.mx', password: 'temporal-123', firstName: 'Juan', lastName: 'Socio', role: 'SOCIO' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bcrypt.hash.mockResolvedValue('hash');
  mocks.sendStaffWelcomeEmail.mockResolvedValue(undefined);
  mocks.prisma.user.create.mockResolvedValue({ id: 'u-1', email: ALTA.email, firstName: 'Juan', role: 'SOCIO' });
  mocks.prisma.user.update.mockResolvedValue({ id: 'u-1', role: 'SOCIO' });
  mocks.prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
});

describe('alta de un SOCIO', () => {
  it('se crea con sus proyectos', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.project.count.mockResolvedValue(2);
    const { error } = await correr(createUser, { body: { ...ALTA, proyectos: ['MON1', 'VDB', 'MON1'] } });
    expect(error).toBeUndefined();
    expect(mocks.prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: 'SOCIO', proyectosSocio: { create: [{ projectId: 'MON1' }, { projectId: 'VDB' }] } }),
    }));
  });

  it('sin proyectos → 400 y no se crea: un socio sin proyectos no tiene nada que ver', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    for (const proyectos of [undefined, [], [''], 'MON1']) {
      const { error } = await correr(createUser, { body: { ...ALTA, proyectos } });
      expect(error.statusCode).toBe(400);
    }
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it('un proyecto inexistente → 400', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.project.count.mockResolvedValue(1);
    const { error } = await correr(createUser, { body: { ...ALTA, proyectos: ['MON1', 'NOEXISTE'] } });
    expect(error.statusCode).toBe(400);
  });

  it('a otro rol no se le guardan proyectos aunque lleguen', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    await correr(createUser, { body: { ...ALTA, role: 'MANAGER', proyectos: ['MON1'] } });
    expect(mocks.prisma.user.create.mock.calls[0][0].data.proyectosSocio).toBeUndefined();
  });
});

describe('editar un SOCIO', () => {
  it('cambiar sus proyectos los reemplaza completos', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'SOCIO' });
    mocks.prisma.project.count.mockResolvedValue(1);
    await correr(updateUser, { params: { id: 'u-1' }, body: { proyectos: ['VDB'] } });
    expect(mocks.prisma.user.update.mock.calls[0][0].data.proyectosSocio).toEqual({ deleteMany: {}, create: [{ projectId: 'VDB' }] });
  });

  it('pasar a SOCIO exige proyectos', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'MANAGER' });
    const { error } = await correr(updateUser, { params: { id: 'u-1' }, body: { role: 'SOCIO' } });
    expect(error.statusCode).toBe(400);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('dejar de ser SOCIO le quita los proyectos', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'SOCIO' });
    await correr(updateUser, { params: { id: 'u-1' }, body: { role: 'MANAGER' } });
    expect(mocks.prisma.user.update.mock.calls[0][0].data.proyectosSocio).toEqual({ deleteMany: {} });
  });

  it('corregir solo el nombre no toca sus proyectos', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'SOCIO' });
    await correr(updateUser, { params: { id: 'u-1' }, body: { firstName: 'Juan', role: 'SOCIO' } });
    expect(mocks.prisma.user.update.mock.calls[0][0].data.proyectosSocio).toBeUndefined();
  });
});
