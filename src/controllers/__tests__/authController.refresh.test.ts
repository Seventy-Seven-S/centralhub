import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const prisma = {
    refreshToken: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
  };
  const jwt = {
    verifyRefreshToken: vi.fn(),
    generateAccessToken: vi.fn(),
    generateRefreshToken: vi.fn(),
    refreshTokenTtlMs: 24 * 60 * 60 * 1000,
  };
  return { prisma, jwt };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));
vi.mock('../../config/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/jwt')>();
  return {
    ...actual,
    verifyRefreshToken: mocks.jwt.verifyRefreshToken,
    generateAccessToken: mocks.jwt.generateAccessToken,
    generateRefreshToken: mocks.jwt.generateRefreshToken,
    refreshTokenTtlMs: mocks.jwt.refreshTokenTtlMs,
  };
});

import { refresh } from '../auth.controller';

const PAYLOAD = { userId: 'user-1', email: 'agente@centralinmob.com', role: 'AGENT', type: 'refresh', authType: 'internal' };
const DB_ROW = { id: 'rt-1', token: 'old-refresh-token', userId: 'user-1', expiresAt: new Date(Date.now() + 60 * 60 * 1000), rotatedAt: null };

function runRefresh(body: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn();
  (refresh as unknown as (r: Request, s: Response, n: () => void) => void)({ body } as Request, res, next);
  return { res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jwt.refreshTokenTtlMs = 24 * 60 * 60 * 1000;
  mocks.jwt.verifyRefreshToken.mockReturnValue(PAYLOAD);
  mocks.prisma.refreshToken.findUnique.mockResolvedValue(DB_ROW);
  mocks.prisma.refreshToken.delete.mockResolvedValue(DB_ROW);
  mocks.prisma.refreshToken.update.mockResolvedValue(DB_ROW);
  mocks.jwt.generateAccessToken.mockReturnValue('new-access-token');
  mocks.jwt.generateRefreshToken.mockReturnValue('new-refresh-token');
  mocks.prisma.refreshToken.create.mockResolvedValue({});
});

describe('POST /auth/refresh — rota el token con una gracia corta', () => {
  it('refresh válido: marca el token como rotado, crea uno nuevo y devuelve tokens nuevos', async () => {
    const { res } = runRefresh({ refreshToken: 'old-refresh-token' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    // Ya NO se borra: se marca. Borrarlo de golpe sacaba del sistema a quien
    // tuviera una segunda pestaña renovando casi al mismo tiempo.
    expect(mocks.prisma.refreshToken.delete).not.toHaveBeenCalled();
    expect(mocks.prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { token: 'old-refresh-token' },
      data: { rotatedAt: expect.any(Date) },
    });
    expect(mocks.prisma.refreshToken.create).toHaveBeenCalledWith({
      data: { token: 'new-refresh-token', userId: 'user-1', expiresAt: expect.any(Date) },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        data: { accessToken: 'new-access-token', refreshToken: 'new-refresh-token' },
      }),
    );
  });

  it('JWT inválido o mal firmado → 401, no toca la BD', async () => {
    mocks.jwt.verifyRefreshToken.mockImplementation(() => { throw new Error('invalid signature'); });

    const { next } = runRefresh({ refreshToken: 'garbage' });
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(next.mock.calls[0][0].statusCode).toBe(401);
    expect(mocks.prisma.refreshToken.delete).not.toHaveBeenCalled();
    expect(mocks.prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('JWT válido pero sin fila en BD (ya rotado o nunca existió) → 401', async () => {
    mocks.prisma.refreshToken.findUnique.mockResolvedValue(null);

    const { next } = runRefresh({ refreshToken: 'old-refresh-token' });
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(next.mock.calls[0][0].statusCode).toBe(401);
    expect(mocks.prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('JWT válido, fila en BD pero ya vencida (expiresAt en el pasado) → 401', async () => {
    mocks.prisma.refreshToken.findUnique.mockResolvedValue({ ...DB_ROW, expiresAt: new Date(Date.now() - 1000) });

    const { next } = runRefresh({ refreshToken: 'old-refresh-token' });
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(next.mock.calls[0][0].statusCode).toBe(401);
    expect(mocks.prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('sin refreshToken en el body → 400', async () => {
    const { next } = runRefresh({});
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(mocks.jwt.verifyRefreshToken).not.toHaveBeenCalled();
  });
});

describe('POST /auth/refresh — la gracia de la segunda pestaña', () => {
  it('acepta un token que se rotó hace segundos, sin volver a marcarlo', async () => {
    mocks.prisma.refreshToken.findUnique.mockResolvedValue({
      ...DB_ROW, rotatedAt: new Date(Date.now() - 5_000),
    });

    const { res } = runRefresh({ refreshToken: 'old-refresh-token' });
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(res.status).toHaveBeenCalledWith(200);
    // No se re-marca: si no, la ventana se alargaría sola con cada reintento.
    expect(mocks.prisma.refreshToken.update).not.toHaveBeenCalled();
    expect(mocks.prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('rechaza un token rotado hace rato — ahí sí huele a token robado', async () => {
    mocks.prisma.refreshToken.findUnique.mockResolvedValue({
      ...DB_ROW, rotatedAt: new Date(Date.now() - 10 * 60_000),
    });

    const { next } = runRefresh({ refreshToken: 'old-refresh-token' });
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
    expect(mocks.prisma.refreshToken.create).not.toHaveBeenCalled();
  });
});
