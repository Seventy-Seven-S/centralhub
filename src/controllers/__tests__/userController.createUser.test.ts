import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const prisma = { user: { findUnique: vi.fn(), create: vi.fn() } };
  const bcrypt = { hash: vi.fn() };
  return { prisma, bcrypt };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));
vi.mock('bcrypt', () => ({ default: mocks.bcrypt }));

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
