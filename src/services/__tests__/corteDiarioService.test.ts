import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    payment: { findMany: vi.fn(), updateMany: vi.fn() },
    corteDiario: { findFirst: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    payment: { findMany: vi.fn() },
    corteDiario: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  };
  return { prisma, tx };
});
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  PaymentStatus: { CONFIRMED: 'CONFIRMED', PENDING: 'PENDING', CANCELED: 'CANCELED' },
  CorteDiarioStatus: { PENDIENTE_ENTREGA: 'PENDIENTE_ENTREGA', RECIBIDO: 'RECIBIDO' },
  UserRole: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', AGENT: 'AGENT', VIEWER: 'VIEWER' },
}));

import corteDiarioService from '../corteDiario.service';

const pagoCash = (id: string, amount: number, code = 'JSA2') => ({
  id, amount, paymentMethod: 'CASH',
  contract: { project: { code, name: code } },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tx.corteDiario.findFirst.mockResolvedValue({ numero: 13 });
  mocks.tx.corteDiario.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'corte-1', ...data }));
  mocks.tx.payment.updateMany.mockResolvedValue({ count: 0 });
});

describe('cerrar — el corte nace del efectivo que esa persona cobró hoy', () => {
  it('numera consecutivo global y liga los pagos en la MISMA transacción', async () => {
    mocks.tx.payment.findMany.mockResolvedValue([pagoCash('p1', 24500), pagoCash('p2', 9000, 'VDR')]);

    const corte = await corteDiarioService.cerrar({ userId: 'marisol', declarado: 33500 });

    expect(corte).toMatchObject({ numero: 14, cobradorId: 'marisol', totalEfectivo: 33500, declarado: 33500 });
    expect(mocks.tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['p1', 'p2'] } }, data: { corteDiarioId: 'corte-1' } }),
    );
  });

  it('solo propone pagos SUYOS, sin corte previo y confirmados', async () => {
    mocks.tx.payment.findMany.mockResolvedValue([pagoCash('p1', 100)]);
    await corteDiarioService.cerrar({ userId: 'marisol', declarado: 100 });

    const where = mocks.tx.payment.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ createdBy: 'marisol', corteDiarioId: null, status: 'CONFIRMED' });
  });

  it('un día sin cobros no se puede cerrar', async () => {
    mocks.tx.payment.findMany.mockResolvedValue([]);
    await expect(corteDiarioService.cerrar({ userId: 'marisol', declarado: 0 }))
      .rejects.toThrow(/sin cobros/i);
    expect(mocks.tx.corteDiario.create).not.toHaveBeenCalled();
  });

  it('el primer corte del sistema es el número 1', async () => {
    mocks.tx.corteDiario.findFirst.mockResolvedValue(null);
    mocks.tx.payment.findMany.mockResolvedValue([pagoCash('p1', 100)]);
    const c = await corteDiarioService.cerrar({ userId: 'x', declarado: 100 });
    expect(c.numero).toBe(1);
  });

  it('las transferencias entran como "otros", no inflan el efectivo a entregar', async () => {
    mocks.tx.payment.findMany.mockResolvedValue([
      pagoCash('p1', 1000),
      { id: 'p2', amount: 5000, paymentMethod: 'TRANSFER', contract: { project: { code: 'JSA2', name: 'JSA2' } } },
    ]);
    const c = await corteDiarioService.cerrar({ userId: 'x', declarado: 1000 });
    expect(c.totalEfectivo).toBe(1000);
    expect(c.totalOtros).toBe(5000);
  });
});

describe('recibir — solo el administrador, y nunca su propio corte', () => {
  const corteBase = { id: 'c1', cobradorId: 'marisol', declarado: 33500, status: 'PENDIENTE_ENTREGA' };

  it('cuando cuadra, marca RECIBIDO sin exigir nota', async () => {
    mocks.prisma.corteDiario.findUnique.mockResolvedValue(corteBase);
    mocks.prisma.corteDiario.update.mockImplementation(({ data }: any) => Promise.resolve(data));

    const r = await corteDiarioService.recibir({ corteId: 'c1', adminId: 'miguel', recibido: 33500 });
    expect(r).toMatchObject({ status: 'RECIBIDO', recibido: 33500, diferencia: 0, recibidoPorId: 'miguel' });
  });

  it('con faltante exige nota y la guarda', async () => {
    mocks.prisma.corteDiario.findUnique.mockResolvedValue(corteBase);
    await expect(corteDiarioService.recibir({ corteId: 'c1', adminId: 'miguel', recibido: 33200 }))
      .rejects.toThrow(/nota/i);

    mocks.prisma.corteDiario.update.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r = await corteDiarioService.recibir({ corteId: 'c1', adminId: 'miguel', recibido: 33200, notaAdmin: 'Cliente pagó de menos' });
    expect(r).toMatchObject({ diferencia: -300, notaAdmin: 'Cliente pagó de menos' });
  });

  it('NADIE recibe su propio corte, ni siendo ADMIN', async () => {
    mocks.prisma.corteDiario.findUnique.mockResolvedValue(corteBase);
    await expect(corteDiarioService.recibir({ corteId: 'c1', adminId: 'marisol', recibido: 33500 }))
      .rejects.toThrow(/tu propio corte/i);
    expect(mocks.prisma.corteDiario.update).not.toHaveBeenCalled();
  });

  it('un corte ya recibido no se vuelve a recibir', async () => {
    mocks.prisma.corteDiario.findUnique.mockResolvedValue({ ...corteBase, status: 'RECIBIDO' });
    await expect(corteDiarioService.recibir({ corteId: 'c1', adminId: 'miguel', recibido: 1 }))
      .rejects.toThrow(/ya fue recibido/i);
  });
});

describe('listar y obtener — cada quien ve lo suyo', () => {
  it('MANAGER solo ve sus propios cortes', async () => {
    mocks.prisma.corteDiario.findMany.mockResolvedValue([]);
    await corteDiarioService.listar({ userId: 'marisol', role: 'MANAGER' });
    expect(mocks.prisma.corteDiario.findMany.mock.calls[0][0].where).toMatchObject({ cobradorId: 'marisol' });
  });

  it('ADMIN ve todos', async () => {
    mocks.prisma.corteDiario.findMany.mockResolvedValue([]);
    await corteDiarioService.listar({ userId: 'miguel', role: 'ADMIN' });
    expect(mocks.prisma.corteDiario.findMany.mock.calls[0][0].where.cobradorId).toBeUndefined();
  });

  it('una MANAGER no puede abrir el corte de otra persona', async () => {
    mocks.prisma.corteDiario.findUnique.mockResolvedValue({ id: 'c1', cobradorId: 'miriam', payments: [] });
    await expect(corteDiarioService.obtener('c1', { userId: 'marisol', role: 'MANAGER' }))
      .rejects.toThrow(/permiso/i);
  });
});
