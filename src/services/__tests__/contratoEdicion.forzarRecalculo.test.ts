import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const contrato = {
    id: 'c1', totalPrice: 270000, downPayment: 7500,
    installmentAmount: 4375, installmentCount: 60,
    startDate: new Date('2026-01-01T00:00:00Z'), status: 'IN_MORA',
    lots: [{ lotId: 'l1' }],
  };
  const prisma = {
    contract: { findUnique: vi.fn().mockResolvedValue(contrato), update: vi.fn() },
    payment: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    contractLot: { findMany: vi.fn().mockResolvedValue([]) },
    cuota: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    cambioContrato: { createMany: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma, contrato };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  ContractStatus: { ACTIVE: 'ACTIVE', IN_MORA: 'IN_MORA', COMPLETED: 'COMPLETED', CANCELED: 'CANCELED', RESCISSION: 'RESCISSION', SIGNED: 'SIGNED' },
  CuotaStatus: { PENDIENTE: 'PENDIENTE', PAGADA: 'PAGADA', MORA: 'MORA', PARCIAL: 'PARCIAL' },
  PaymentType: { INSTALLMENT: 'INSTALLMENT', EXTRA_PAYMENT: 'EXTRA_PAYMENT', DOWN_PAYMENT: 'DOWN_PAYMENT' },
  PaymentStatus: { CONFIRMED: 'CONFIRMED' },
}));

import { editarDatosDelContrato } from '../contratoEdicion.service';

beforeEach(() => { vi.clearAllMocks(); });

describe('forzarRecalculo', () => {
  // Caso real H119 (Santander): su mensualidad es de $4,375 pero las primeras
  // cuatro cuotas del calendario quedaron en $4,500, así que el sobrepago del
  // cliente se lo comía el propio calendario en vez de acumularse. Los datos
  // del contrato están bien; lo que hay que rearmar es el calendario.
  it('rearma el calendario aunque no cambie ningún campo', async () => {
    const r = await editarDatosDelContrato(
      'c1', { motivo: 'Rearmar el calendario que no concuerda con la mensualidad' },
      'u1', { dryRun: true, forzarRecalculo: true },
    );
    expect(r.balanceDespues).toBe(262500);
  });

  it('sin la opción, una edición vacía se sigue rechazando', async () => {
    await expect(
      editarDatosDelContrato('c1', { motivo: 'No cambia nada en absoluto' }, 'u1', { dryRun: true }),
    ).rejects.toThrow(/ning[úu]n cambio/i);
  });
});
