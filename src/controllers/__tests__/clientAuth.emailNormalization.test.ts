import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const prisma = {
    clientUser: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    client: { findFirst: vi.fn(), create: vi.fn() },
    clientRefreshToken: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  const bcrypt = { compare: vi.fn(), hash: vi.fn() };
  return { prisma, bcrypt };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));
vi.mock('bcrypt', () => ({ default: mocks.bcrypt }));

import { loginClient } from '../clientAuth.controller';

const CLIENT_USER = {
  id: 'cu-1', email: 'remocas.mat@gmail.com', password: 'hashed-pw', status: 'ACTIVE',
  client: { id: 'client-1', globalCode: 'CLI-000001', firstName: 'Marisol', lastName: 'Mendoza', email: 'remocas.mat@gmail.com' },
};

function runController(body: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn();
  (loginClient as any)({ body } as Request, res, next);
  return { res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bcrypt.compare.mockResolvedValue(true);
  mocks.prisma.clientRefreshToken.create.mockResolvedValue({});
  mocks.prisma.clientUser.update.mockResolvedValue({});
});

describe('loginClient (portal) — mismo email con punto en Gmail debe encontrar al cliente', () => {
  it('email con punto y mayúsculas → findUnique busca en minúsculas, punto intacto', async () => {
    mocks.prisma.clientUser.findUnique.mockResolvedValue(CLIENT_USER);

    const { res, next } = runController({ email: 'Remocas.Mat@Gmail.com', password: 'pw' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(next).not.toHaveBeenCalled();
    expect(mocks.prisma.clientUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'remocas.mat@gmail.com' } }),
    );
  });
});
