import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma = {
    rateLimitBucket: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return { prisma };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
}));

import { PrismaRateLimitStore } from '../rateLimitStore';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PrismaRateLimitStore', () => {
  it('test 1: increment sobre llave nueva → crea bucket con points=1 y resetTime = ahora + windowMs', async () => {
    mocks.prisma.rateLimitBucket.findUnique.mockResolvedValue(null);
    const resetTime = new Date(Date.now() + 15 * 60 * 1000);
    mocks.prisma.rateLimitBucket.upsert.mockResolvedValue({ key: 'k1', points: 1, resetTime });

    const store = new PrismaRateLimitStore(15 * 60 * 1000);
    const result = await store.increment('k1');

    expect(mocks.prisma.rateLimitBucket.upsert).toHaveBeenCalledOnce();
    const call = mocks.prisma.rateLimitBucket.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ key: 'k1' });
    expect(call.create.points).toBe(1);
    expect(result.totalHits).toBe(1);
  });

  it('test 2: increment dentro de la ventana vigente → suma sobre el bucket existente (no resetea)', async () => {
    const resetTime = new Date(Date.now() + 10 * 60 * 1000); // aún no vence
    mocks.prisma.rateLimitBucket.findUnique.mockResolvedValue({ key: 'k1', points: 3, resetTime });
    mocks.prisma.rateLimitBucket.update.mockResolvedValue({ key: 'k1', points: 4, resetTime });

    const store = new PrismaRateLimitStore(15 * 60 * 1000);
    const result = await store.increment('k1');

    expect(mocks.prisma.rateLimitBucket.update).toHaveBeenCalledOnce();
    expect(mocks.prisma.rateLimitBucket.upsert).not.toHaveBeenCalled();
    expect(result.totalHits).toBe(4);
    expect(result.resetTime).toEqual(resetTime);
  });

  it('test 3: increment con ventana ya vencida → resetea a points=1 con nuevo resetTime', async () => {
    const vencido = new Date(Date.now() - 60 * 1000); // ya pasó
    mocks.prisma.rateLimitBucket.findUnique.mockResolvedValue({ key: 'k1', points: 5, resetTime: vencido });
    const nuevoResetTime = new Date(Date.now() + 15 * 60 * 1000);
    mocks.prisma.rateLimitBucket.upsert.mockResolvedValue({ key: 'k1', points: 1, resetTime: nuevoResetTime });

    const store = new PrismaRateLimitStore(15 * 60 * 1000);
    const result = await store.increment('k1');

    expect(mocks.prisma.rateLimitBucket.upsert).toHaveBeenCalledOnce();
    const call = mocks.prisma.rateLimitBucket.upsert.mock.calls[0][0];
    expect(call.update.points).toBe(1);
    expect(result.totalHits).toBe(1);
    expect(mocks.prisma.rateLimitBucket.update).not.toHaveBeenCalled();
  });

  it('test 4: resetKey borra el bucket', async () => {
    const store = new PrismaRateLimitStore(15 * 60 * 1000);
    await store.resetKey('k1');

    expect(mocks.prisma.rateLimitBucket.deleteMany).toHaveBeenCalledWith({ where: { key: 'k1' } });
  });

  it('test 5: init(options) actualiza el windowMs usado para calcular resetTime', async () => {
    mocks.prisma.rateLimitBucket.findUnique.mockResolvedValue(null);
    mocks.prisma.rateLimitBucket.upsert.mockImplementation(({ create }: any) =>
      Promise.resolve({ key: 'k1', points: create.points, resetTime: create.resetTime }),
    );

    const store = new PrismaRateLimitStore(1000); // windowMs inicial irrelevante, init lo pisa
    store.init!({ windowMs: 5 * 60 * 1000 } as any);

    const before = Date.now();
    const result = await store.increment('k1');
    const elapsedMs = (result.resetTime!.getTime() - before);

    expect(elapsedMs).toBeGreaterThan(5 * 60 * 1000 - 1000);
    expect(elapsedMs).toBeLessThan(5 * 60 * 1000 + 1000);
  });
});
