import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const prisma = { refreshToken: { deleteMany: vi.fn() } };
  return { prisma };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));

import { logout } from '../auth.controller';

function runLogout(body: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn();
  (logout as unknown as (r: Request, s: Response, n: () => void) => void)({ body } as Request, res, next);
  return { res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
});

describe('POST /auth/logout — invalida el refresh token en BD, es idempotente', () => {
  it('refreshToken existente en BD → se borra, responde 200', async () => {
    const { res } = runLogout({ refreshToken: 'some-refresh-token' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { token: 'some-refresh-token' } });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('refreshToken que ya no existe en BD (doble logout) → sigue respondiendo 200, no truena', async () => {
    mocks.prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

    const { res, next } = runLogout({ refreshToken: 'ya-no-existe' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sin refreshToken en el body → 400, no llama a la BD', async () => {
    const { next } = runLogout({});
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(mocks.prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });
});
