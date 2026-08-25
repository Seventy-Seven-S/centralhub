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
    commission: { create: vi.fn() },
    clientUser: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  // tx expuesto a los tests (no solo dentro del closure de $transaction) para
  // poder inspeccionar con qué agentId se creó el Contract dentro de la tx.
  const tx = {
    contract: { create: vi.fn() },
    contractLot: { create: vi.fn() },
    lot: { updateMany: vi.fn() },
  };
  return { prisma, tx };
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
  CommissionType: { SALE: 'SALE', REFERRAL: 'REFERRAL', BONUS: 'BONUS' },
  CommissionStatus: { PENDING: 'PENDING', APPROVED: 'APPROVED', PAID: 'PAID' },
}));
vi.mock('../email.service', () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock('../ineDocument', () => ({ migrateIneToClient: vi.fn() }));
vi.mock('../notification.service', () => ({
  default: { createNotification: vi.fn(), createForAudiences: vi.fn() },
}));
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import contractService from '../contract.service';
import notificationService from '../notification.service';
import { logger } from '../../utils/logger';

beforeEach(() => {
  vi.clearAllMocks();

  mocks.prisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
  mocks.prisma.project.findUnique.mockResolvedValue({ id: 'project-1', code: 'MON1' });
  mocks.prisma.lot.findMany.mockResolvedValue([
    { id: 'lot-1', status: 'AVAILABLE', currentPrice: 100000, reservationDeposit: null, manzana: 5, lotNumber: '12', reservedAt: null, reservedByAgentId: null },
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

  mocks.tx.contract.create.mockImplementation(({ data }: any) =>
    Promise.resolve({ id: 'contract-1', codigoLegado: 'MON1001', ...data }),
  );
  mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(mocks.tx));
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

describe('createContract — herencia del asesor del apartado (Contract.agentId)', () => {
  it('lote apartado CON asesor + sin agentId explícito (key ausente) → el contrato hereda el asesor del apartado', async () => {
    mocks.prisma.lot.findMany.mockResolvedValue([
      { id: 'lot-1', status: 'AVAILABLE', currentPrice: 100000, reservationDeposit: null, manzana: 5, lotNumber: '12', reservedAt: null, reservedByAgentId: 'agent-A' },
    ]);
    const input = baseInput();
    delete input.agentId; // key genuinamente ausente, no undefined explícito

    await contractService.createContract(input);

    expect(mocks.tx.contract.create).toHaveBeenCalledOnce();
    expect(mocks.tx.contract.create.mock.calls[0][0].data.agentId).toBe('agent-A');
  });

  it('lote apartado SIN asesor (reservedByAgentId null) → el contrato queda sin asesor, sin error', async () => {
    mocks.prisma.lot.findMany.mockResolvedValue([
      { id: 'lot-1', status: 'AVAILABLE', currentPrice: 100000, reservationDeposit: null, manzana: 5, lotNumber: '12', reservedAt: null, reservedByAgentId: null },
    ]);
    const input = baseInput();
    delete input.agentId;

    await expect(contractService.createContract(input)).resolves.toBeDefined();
    expect(mocks.tx.contract.create.mock.calls[0][0].data.agentId).toBeNull();
  });

  it('agentId explícito (distinto al del apartado) → gana el override, no se hereda', async () => {
    mocks.prisma.lot.findMany.mockResolvedValue([
      { id: 'lot-1', status: 'AVAILABLE', currentPrice: 100000, reservationDeposit: null, manzana: 5, lotNumber: '12', reservedAt: null, reservedByAgentId: 'agent-A' },
    ]);

    await contractService.createContract(baseInput({ agentId: 'agent-B' }));

    expect(mocks.tx.contract.create.mock.calls[0][0].data.agentId).toBe('agent-B');
  });

  it('agentId: null explícito (el humano borró conscientemente el asesor precargado) → gana el override, NO se re-hereda', async () => {
    mocks.prisma.lot.findMany.mockResolvedValue([
      { id: 'lot-1', status: 'AVAILABLE', currentPrice: 100000, reservationDeposit: null, manzana: 5, lotNumber: '12', reservedAt: null, reservedByAgentId: 'agent-A' },
    ]);

    await contractService.createContract(baseInput({ agentId: null }));

    expect(mocks.tx.contract.create.mock.calls[0][0].data.agentId).toBeNull();
  });

  it('multi-lote, mismo asesor en todos → hereda ese asesor', async () => {
    mocks.prisma.lot.findMany.mockResolvedValue([
      { id: 'lot-1', status: 'AVAILABLE', currentPrice: 50000, reservationDeposit: null, manzana: 5, lotNumber: '12', reservedAt: null, reservedByAgentId: 'agent-A' },
      { id: 'lot-2', status: 'AVAILABLE', currentPrice: 50000, reservationDeposit: null, manzana: 5, lotNumber: '13', reservedAt: null, reservedByAgentId: 'agent-A' },
    ]);
    const input = baseInput({ lotIds: ['lot-1', 'lot-2'] });
    delete input.agentId;

    await contractService.createContract(input);

    expect(mocks.tx.contract.create.mock.calls[0][0].data.agentId).toBe('agent-A');
  });

  it('multi-lote, asesores DISTINTOS (conflicto) → no adivina, el contrato queda sin asesor por defecto', async () => {
    mocks.prisma.lot.findMany.mockResolvedValue([
      { id: 'lot-1', status: 'AVAILABLE', currentPrice: 50000, reservationDeposit: null, manzana: 5, lotNumber: '12', reservedAt: null, reservedByAgentId: 'agent-A' },
      { id: 'lot-2', status: 'AVAILABLE', currentPrice: 50000, reservationDeposit: null, manzana: 5, lotNumber: '13', reservedAt: null, reservedByAgentId: 'agent-B' },
    ]);
    const input = baseInput({ lotIds: ['lot-1', 'lot-2'] });
    delete input.agentId;

    await contractService.createContract(input);

    expect(mocks.tx.contract.create.mock.calls[0][0].data.agentId).toBeNull();
  });

  it('buildCommissionData recibe el finalAgentId (heredado), NO el crudo — Contract.agentId y Commission.agentId nunca divergen', async () => {
    mocks.prisma.lot.findMany.mockResolvedValue([
      { id: 'lot-1', status: 'AVAILABLE', currentPrice: 100000, reservationDeposit: null, manzana: 5, lotNumber: '12', reservedAt: null, reservedByAgentId: 'agent-A' },
    ]);
    const input = baseInput({ commissionPercentage: 5 });
    delete input.agentId; // sin override — debe heredar 'agent-A' y la comisión debe usar ESE valor

    await contractService.createContract(input);

    expect(mocks.prisma.commission.create).toHaveBeenCalledOnce();
    const commissionData = mocks.prisma.commission.create.mock.calls[0][0].data;
    expect(commissionData.agentId).toBe('agent-A');
    // Mismo valor que el que quedó en el Contract — nunca divergen.
    expect(commissionData.agentId).toBe(mocks.tx.contract.create.mock.calls[0][0].data.agentId);
  });
});

describe('createContract — fallo ruidoso al crear la comisión (cadena de atribución, pieza 5)', () => {
  it('comisión falla → logger.error con contractId+agentId+error, notificación a ADMIN+MANAGER, Y el contrato se retorna igual (el fallo NO propaga)', async () => {
    mocks.prisma.lot.findMany.mockResolvedValue([
      { id: 'lot-1', status: 'AVAILABLE', currentPrice: 100000, reservationDeposit: null, manzana: 5, lotNumber: '12', reservedAt: null, reservedByAgentId: 'agent-A' },
    ]);
    const dbError = new Error('connection reset');
    mocks.prisma.commission.create.mockRejectedValueOnce(dbError);

    const input = baseInput({ commissionPercentage: 5 });
    delete input.agentId; // hereda 'agent-A'

    // No debe rechazar — el contrato se crea igual pese al fallo de comisión.
    await expect(contractService.createContract(input)).resolves.toBeDefined();

    expect(logger.error).toHaveBeenCalled();
    const loggedMessage = (logger.error as any).mock.calls
      .map((c: any[]) => String(c[0]))
      .find((msg: string) => msg.includes('comisión') || msg.includes('comision'));
    expect(loggedMessage).toBeDefined();
    expect(loggedMessage).toContain('contract-1'); // contractId
    expect(loggedMessage).toContain('agent-A');    // agentId
    expect(loggedMessage).toContain('connection reset'); // error real

    expect(notificationService.createForAudiences).toHaveBeenCalledOnce();
    const [notifInput, audiences] = (notificationService.createForAudiences as any).mock.calls[0];
    expect(audiences).toEqual(expect.arrayContaining(['ADMIN', 'MANAGER']));
    expect(audiences).toHaveLength(2);
    expect(notifInput.relatedEntity).toBe('contract');
    expect(notifInput.relatedEntityId).toBe('contract-1');
  });

  it('comisión se crea bien → sin logger.error de comisión, sin notificación de fallo', async () => {
    mocks.prisma.lot.findMany.mockResolvedValue([
      { id: 'lot-1', status: 'AVAILABLE', currentPrice: 100000, reservationDeposit: null, manzana: 5, lotNumber: '12', reservedAt: null, reservedByAgentId: 'agent-A' },
    ]);
    const input = baseInput({ commissionPercentage: 5 });
    delete input.agentId;

    await contractService.createContract(input);

    expect(mocks.prisma.commission.create).toHaveBeenCalledOnce();
    const errorCalls = (logger.error as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(errorCalls.some((msg: string) => msg.toLowerCase().includes('comisi'))).toBe(false);
    expect(notificationService.createForAudiences).not.toHaveBeenCalled();
  });

  it('contrato sin asesor → ni se intenta crear comisión, cero logs de fallo, cero notificación', async () => {
    mocks.prisma.lot.findMany.mockResolvedValue([
      { id: 'lot-1', status: 'AVAILABLE', currentPrice: 100000, reservationDeposit: null, manzana: 5, lotNumber: '12', reservedAt: null, reservedByAgentId: null },
    ]);
    const input = baseInput();
    delete input.agentId; // sin herencia posible (lote sin asesor) y sin override

    await contractService.createContract(input);

    expect(mocks.prisma.commission.create).not.toHaveBeenCalled();
    expect(notificationService.createForAudiences).not.toHaveBeenCalled();
    const errorCalls = (logger.error as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(errorCalls.some((msg: string) => msg.toLowerCase().includes('comisi'))).toBe(false);
  });
});
