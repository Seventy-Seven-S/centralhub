import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma = {
    client: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    lot: { findMany: vi.fn(), updateMany: vi.fn() },
    contract: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    contractLot: { create: vi.fn() },
    cuota: { createMany: vi.fn() },
    payment: { create: vi.fn() },
    clientUser: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  ContractStatus: { DRAFT: 'DRAFT', ACTIVE: 'ACTIVE', SIGNED: 'SIGNED', COMPLETED: 'COMPLETED', CANCELED: 'CANCELED', IN_MORA: 'IN_MORA' },
  LotStatus: { AVAILABLE: 'AVAILABLE', RESERVED: 'RESERVED', SOLD: 'SOLD', UNAVAILABLE: 'UNAVAILABLE' },
  PaymentPlanType: { INSTALLMENTS: 'INSTALLMENTS', CASH: 'CASH', BANK_FINANCING: 'BANK_FINANCING' },
  CuotaStatus: { PENDIENTE: 'PENDIENTE', PAGADA: 'PAGADA', MORA: 'MORA' },
  PaymentType: { RESERVATION_DEPOSIT: 'RESERVATION_DEPOSIT', DOWN_PAYMENT: 'DOWN_PAYMENT' },
  PaymentMethod: { TRANSFER: 'TRANSFER', CASH: 'CASH' },
  PaymentStatus: { CONFIRMED: 'CONFIRMED', PENDING: 'PENDING' },
}));
vi.mock('../email.service', () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock('../ineDocument', () => ({ migrateIneToClient: vi.fn() }));
vi.mock('../notification.service', () => ({ default: { createNotification: vi.fn() } }));

import contractService from '../contract.service';

beforeEach(() => {
  vi.clearAllMocks();

  mocks.prisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
  mocks.prisma.project.findUnique.mockResolvedValue({ id: 'project-1', code: 'MON1' });
  mocks.prisma.lot.findMany.mockResolvedValue([
    { id: 'lot-1', status: 'AVAILABLE', currentPrice: 100000, reservationDeposit: null, manzana: 5, lotNumber: '12', reservedAt: null },
  ]);
  mocks.prisma.contract.findMany.mockResolvedValue([]);
  mocks.prisma.contract.findFirst.mockResolvedValue(null);
  mocks.prisma.contract.findUnique.mockResolvedValue({
    id: 'contract-1',
    codigoLegado: 'MON1001',
    client: { email: null, firstName: 'Ana', lastName: 'Pérez', phone: '5551234567' },
    lots: [{ lot: { manzana: 5, lotNumber: '12' } }],
    coOwners: [],
  });

  mocks.prisma.$transaction.mockImplementation(async (cb: any) => {
    const tx = {
      contract: {
        create: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'contract-1', codigoLegado: 'MON1001', ...data }),
        ),
      },
      contractLot: { create: vi.fn() },
      lot: { updateMany: vi.fn() },
    };
    return cb(tx);
  });
});

function baseInput(overrides: Record<string, any> = {}) {
  return {
    clientId: 'client-1',
    projectId: 'project-1',
    lotIds: ['lot-1'],
    totalPrice: 100000,
    downPayment: 0,
    financedAmount: 100000,
    interestRate: 0,
    termMonths: 60,
    startDate: new Date('2026-01-01'),
    ...overrides,
  } as any;
}

describe('createContract — cálculo financiero en backend (RF1.3)', () => {
  it('genera cuotas cuyo installmentAmount NO viene del monthlyPayment del frontend, sino del cálculo backend', async () => {
    await contractService.createContract(
      baseInput({ monthlyPayment: 999999.99 /* valor deliberadamente erróneo del frontend */ }),
    );

    expect(mocks.prisma.cuota.createMany).toHaveBeenCalledOnce();
    const cuotasData = mocks.prisma.cuota.createMany.mock.calls[0][0].data as any[];
    expect(cuotasData).toHaveLength(60);
    // financiado = totalPrice (100000) - totalUpfront (0) = 100000; 100000/60 = 1666.67 base
    expect(cuotasData[0].montoEsperado).toBe(1666.67);
    expect(cuotasData[0].montoEsperado).not.toBe(999999.99);
  });

  it('la suma de las cuotas generadas cuadra exacto contra el financingAmount calculado por el backend', async () => {
    await contractService.createContract(baseInput());

    const cuotasData = mocks.prisma.cuota.createMany.mock.calls[0][0].data as any[];
    const sum = cuotasData.reduce((acc, c) => acc + c.montoEsperado, 0);
    expect(Math.round(sum * 100) / 100).toBe(100000);
  });

  it('la última cuota absorbe el residuo de redondeo (no todas las cuotas son idénticas)', async () => {
    await contractService.createContract(baseInput());

    const cuotasData = mocks.prisma.cuota.createMany.mock.calls[0][0].data as any[];
    expect(cuotasData[59].montoEsperado).not.toBe(cuotasData[0].montoEsperado);
  });
});
