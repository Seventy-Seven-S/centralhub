import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    payment: { findMany: vi.fn(), updateMany: vi.fn() },
    corte: { findFirst: vi.fn(), create: vi.fn() },
    expense: { createMany: vi.fn() },
  };
  const prisma = {
    payment: { findMany: vi.fn() },
    corte: { findMany: vi.fn(), findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  };
  return { prisma, tx };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  PaymentStatus: { CONFIRMED: 'CONFIRMED', PENDING: 'PENDING' },
}));

import { calcularReparto, corteService } from '../corte.service';

describe('calcularReparto (puro)', () => {
  it('el dueño recibe el remanente: total − egresos capturados', () => {
    const r = calcularReparto(100000, [{ categoryId: 'central', amount: 30000 }, { categoryId: 'planos', amount: 5000 }]);
    expect(r).toEqual({ totalEgresos: 35000, entregadoDueno: 65000 });
  });
  it('rechaza egresos negativos o mayores al total', () => {
    expect(() => calcularReparto(1000, [{ categoryId: 'x', amount: -1 }])).toThrow(/negativ/i);
    expect(() => calcularReparto(1000, [{ categoryId: 'x', amount: 1500 }])).toThrow(/exceden/i);
  });
});

const PAGOS = [
  { id: 'p1', amount: 4000, paymentDate: new Date('2026-09-06'), contract: { projectId: 'proj-1' } },
  { id: 'p2', amount: 6000, paymentDate: new Date('2026-09-08'), contract: { projectId: 'proj-1' } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', code: 'JSA2', name: 'JSA 2' });
  mocks.tx.payment.findMany.mockResolvedValue(PAGOS);
  mocks.tx.corte.findFirst.mockResolvedValue({ numero: 3 });
  mocks.tx.corte.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'corte-4', ...data }));
  mocks.tx.payment.updateMany.mockResolvedValue({ count: 2 });
  mocks.tx.expense.createMany.mockResolvedValue({ count: 2 });
});

describe('corteService.crearCorte', () => {
  const input = { projectId: 'proj-1', fecha: '2026-09-10', paymentIds: ['p1', 'p2'], reparto: [{ categoryId: 'central', amount: 3000 }], dueno: 'Antonio Isassi', duenoCategoryId: 'dueno', userId: 'u-1', notas: undefined };

  it('crea el corte consecutivo, liga los pagos, registra egresos (incluido el del dueño) en una transacción', async () => {
    const corte = await corteService.crearCorte(input);

    expect(corte.id).toBe('corte-4');
    const data = mocks.tx.corte.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'proj-1', numero: 4, totalIngresos: 10000, totalEgresos: 3000, entregadoDueno: 7000, dueno: 'Antonio Isassi', createdById: 'u-1' });
    expect(data.periodoInicio).toEqual(new Date('2026-09-06'));
    expect(data.periodoFin).toEqual(new Date('2026-09-08'));

    expect(mocks.tx.payment.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['p1', 'p2'] } }, data: { corteId: 'corte-4' } });
    const egresos = mocks.tx.expense.createMany.mock.calls[0][0].data;
    expect(egresos).toHaveLength(2);
    expect(egresos.find((e: any) => e.categoryId === 'dueno')).toMatchObject({ amount: 7000, projectId: 'proj-1', corteId: 'corte-4' });
    expect(egresos.find((e: any) => e.categoryId === 'central')).toMatchObject({ amount: 3000 });
  });

  it('solo acepta pagos confirmados del proyecto y sin corte previo: si alguno no cumple, rechaza todo', async () => {
    mocks.tx.payment.findMany.mockResolvedValue([PAGOS[0]]); // p2 no vino (ya tiene corte / otro proyecto)
    await expect(corteService.crearCorte(input)).rejects.toThrow(/ya están en otro corte|no pertenecen/i);
    expect(mocks.tx.corte.create).not.toHaveBeenCalled();
  });

  it('rechaza un corte sin pagos', async () => {
    await expect(corteService.crearCorte({ ...input, paymentIds: [] })).rejects.toThrow(/al menos un pago/i);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('corteService.pendientes', () => {
  it('devuelve los pagos confirmados del proyecto sin corte, del más viejo al más nuevo', async () => {
    mocks.prisma.payment.findMany.mockResolvedValue(PAGOS);
    const r = await corteService.pendientes('proj-1');
    expect(mocks.prisma.payment.findMany.mock.calls[0][0].where).toMatchObject({ status: 'CONFIRMED', corteId: null, contract: { projectId: 'proj-1' } });
    expect(r.total).toBe(10000);
    expect(r.pagos).toHaveLength(2);
  });
});
