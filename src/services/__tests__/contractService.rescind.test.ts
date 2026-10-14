import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    contract: { findUnique: vi.fn(), update: vi.fn() },
    contractLot: { findMany: vi.fn(), deleteMany: vi.fn() },
    lot: { update: vi.fn() },
    cuota: { deleteMany: vi.fn() },
    payment: { create: vi.fn() },
    project: { findUnique: vi.fn() },
    expenseCategory: { upsert: vi.fn() },
    expense: { create: vi.fn() },
    user: { findFirst: vi.fn() },
  };
  const prisma = {
    contract: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  };
  const createNotification = vi.fn();
  return { prisma, tx, createNotification };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  ContractStatus: { DRAFT: 'DRAFT', ACTIVE: 'ACTIVE', SIGNED: 'SIGNED', COMPLETED: 'COMPLETED', CANCELED: 'CANCELED', IN_MORA: 'IN_MORA', RESCISSION: 'RESCISSION' },
  LotStatus: { AVAILABLE: 'AVAILABLE', RESERVED: 'RESERVED', SOLD: 'SOLD', UNAVAILABLE: 'UNAVAILABLE' },
  PaymentPlanType: { INSTALLMENTS: 'INSTALLMENTS', CASH: 'CASH' },
  CuotaStatus: { PENDIENTE: 'PENDIENTE', PAGADA: 'PAGADA', MORA: 'MORA' },
  PaymentType: { RESERVATION_DEPOSIT: 'RESERVATION_DEPOSIT', DOWN_PAYMENT: 'DOWN_PAYMENT', INSTALLMENT: 'INSTALLMENT', RESCISSION_REFUND: 'RESCISSION_REFUND' },
  PaymentMethod: { TRANSFER: 'TRANSFER', CASH: 'CASH' },
  PaymentStatus: { CONFIRMED: 'CONFIRMED', PENDING: 'PENDING' },
}));
vi.mock('../email.service', () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock('../ineDocument', () => ({ migrateIneToClient: vi.fn() }));
vi.mock('../notification.service', () => ({ default: { createNotification: mocks.createNotification } }));

import contractService from '../contract.service';

const CONTRATO = { id: 'c-1', status: 'IN_MORA', contractNumber: 'VDR-V001', codigoLegado: 'V001', clientId: 'cl-1', projectId: 'p-1', balance: 150000, notes: null };

function input(over: Partial<any> = {}) {
  return { reason: 'Cliente firmó carta de cancelación', date: new Date('2026-09-05'), refundAmount: 0, userId: 'u-1', fileKey: undefined, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.contract.findUnique.mockResolvedValue(CONTRATO);
  mocks.tx.contract.findUnique.mockResolvedValue(CONTRATO);
  mocks.tx.contractLot.findMany.mockResolvedValue([
    { id: 'cx-1', lotId: 'lot-1', lot: { id: 'lot-1', manzana: 1, lotNumber: '37', contracts: [{ contractId: 'c-1' }] } },
  ]);
  mocks.tx.project.findUnique.mockResolvedValue({ sinCortes: false });
  mocks.tx.expenseCategory.upsert.mockResolvedValue({ id: 'cat-canc' });
  mocks.tx.expense.create.mockResolvedValue({ id: 'g-1' });
  mocks.tx.user.findFirst.mockResolvedValue({ id: 'admin-1' });
  mocks.tx.contractLot.deleteMany.mockResolvedValue({ count: 1 });
  mocks.tx.lot.update.mockResolvedValue({});
  mocks.tx.cuota.deleteMany.mockResolvedValue({ count: 40 });
  mocks.tx.payment.create.mockResolvedValue({ id: 'pay-r' });
  mocks.tx.contract.update.mockImplementation(({ data }: any) => Promise.resolve({ ...CONTRATO, ...data }));
});

describe('rescindContract', () => {
  it('rescinde: contrato RESCISSION con motivo/fecha/usuario, balance 0, lote liberado SIN perder el vínculo, cuotas pendientes borradas, pagos intactos', async () => {
    const result = await contractService.rescindContract('c-1', input({ fileKey: 'contracts/c-1/rescision.pdf' }));

    expect(result.status).toBe('RESCISSION');
    const data = mocks.tx.contract.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'RESCISSION', balance: 0, moraMonthsCount: 0, rescissionReason: 'Cliente firmó carta de cancelación', rescindedById: 'u-1', rescissionFileUrl: 'contracts/c-1/rescision.pdf' });
    expect(data.rescindedAt).toEqual(new Date('2026-09-05'));

    // El vínculo con el lote se CONSERVA: es el único registro de qué lote
    // tenía el cliente. El lote se libera dejándolo AVAILABLE, y las consultas
    // de "quién tiene este lote" ya descartan los contratos rescindidos.
    expect(mocks.tx.contractLot.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.lot.update).toHaveBeenCalledWith({ where: { id: 'lot-1' }, data: { status: 'AVAILABLE' } });
    expect(mocks.tx.cuota.deleteMany).toHaveBeenCalledWith({ where: { contractId: 'c-1', status: 'PENDIENTE' } });
    expect(mocks.tx.payment.create).not.toHaveBeenCalled();
    expect(mocks.createNotification).toHaveBeenCalledOnce();
  });

  it('con devolución registra un pago RESCISSION_REFUND negativo por el monto', async () => {
    await contractService.rescindContract('c-1', input({ refundAmount: 25000 }));
    expect(mocks.tx.payment.create).toHaveBeenCalledOnce();
    const data = mocks.tx.payment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ contractId: 'c-1', clientId: 'cl-1', paymentType: 'RESCISSION_REFUND', amount: -25000, status: 'CONFIRMED' });
  });

  it('la devolución sale como gasto de Cancelaciones ligado a su pago, para descontarse en el corte', async () => {
    await contractService.rescindContract('c-1', input({ refundAmount: 25000 }));
    expect(mocks.tx.expenseCategory.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { name: 'Cancelaciones' } }));
    expect(mocks.tx.expense.create).toHaveBeenCalledOnce();
    const data = mocks.tx.expense.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      amount: 25000, projectId: 'p-1', categoryId: 'cat-canc', createdById: 'u-1',
      date: new Date('2026-09-05'), descontarEnCorte: true, pagoDevolucionId: 'pay-r',
    });
    expect(data.description).toContain('M1-L37');
    expect(data.description).toContain('V001');
  });

  it('en un proyecto sin cortes el gasto se registra pero no se marca para descontar', async () => {
    mocks.tx.project.findUnique.mockResolvedValue({ sinCortes: true });
    await contractService.rescindContract('c-1', input({ refundAmount: 25000 }));
    expect(mocks.tx.expense.create.mock.calls[0][0].data.descontarEnCorte).toBe(false);
  });

  it('sin usuario en la sesión, el gasto queda a nombre del administrador', async () => {
    await contractService.rescindContract('c-1', input({ refundAmount: 25000, userId: undefined }));
    expect(mocks.tx.expense.create.mock.calls[0][0].data.createdById).toBe('admin-1');
  });

  it('sin devolución no se crea gasto', async () => {
    await contractService.rescindContract('c-1', input());
    expect(mocks.tx.expense.create).not.toHaveBeenCalled();
  });

  it('un lote compartido con otro contrato vigente NO se libera', async () => {
    mocks.tx.contractLot.findMany.mockResolvedValue([
      { id: 'cx-1', lotId: 'lot-1', lot: { id: 'lot-1', contracts: [{ contractId: 'c-1' }, { contractId: 'c-otro' }] } },
    ]);
    await contractService.rescindContract('c-1', input());
    expect(mocks.tx.contractLot.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.lot.update).not.toHaveBeenCalled();
  });

  it('el lote rescindido conserva su vínculo para que quede el historial', async () => {
    await contractService.rescindContract('c-1', input());
    // Lo que responde "¿qué lote tenía este cliente?" después de rescindir.
    expect(mocks.tx.contractLot.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.contractLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { contractId: 'c-1' } }),
    );
  });

  it('rechaza si ya está rescindido o cancelado, sin abrir transacción', async () => {
    mocks.prisma.contract.findUnique.mockResolvedValue({ ...CONTRATO, status: 'RESCISSION' });
    await expect(contractService.rescindContract('c-1', input())).rejects.toThrow(/ya está rescindido|cancelado/i);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza sin motivo', async () => {
    await expect(contractService.rescindContract('c-1', input({ reason: '   ' }))).rejects.toThrow(/motivo/i);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza contrato inexistente', async () => {
    mocks.prisma.contract.findUnique.mockResolvedValue(null);
    await expect(contractService.rescindContract('nope', input())).rejects.toThrow(/no encontrado/i);
  });
});
