import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma = {
    contract: { findUnique: vi.fn(), update: vi.fn() },
  };
  return { prisma };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  ContractStatus: { DRAFT: 'DRAFT', ACTIVE: 'ACTIVE', SIGNED: 'SIGNED', COMPLETED: 'COMPLETED', CANCELED: 'CANCELED', IN_MORA: 'IN_MORA' },
  LotStatus: { AVAILABLE: 'AVAILABLE', RESERVED: 'RESERVED', SOLD: 'SOLD', UNAVAILABLE: 'UNAVAILABLE' },
  PaymentPlanType: { INSTALLMENTS: 'INSTALLMENTS', CASH: 'CASH' },
  CuotaStatus: { PENDIENTE: 'PENDIENTE', PAGADA: 'PAGADA', MORA: 'MORA' },
  PaymentType: { RESERVATION_DEPOSIT: 'RESERVATION_DEPOSIT', DOWN_PAYMENT: 'DOWN_PAYMENT' },
  PaymentMethod: { TRANSFER: 'TRANSFER', CASH: 'CASH' },
  PaymentStatus: { CONFIRMED: 'CONFIRMED', PENDING: 'PENDING' },
}));
vi.mock('../email.service', () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock('../ineDocument', () => ({ migrateIneToClient: vi.fn() }));

import contractService from '../contract.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('activateContract', () => {
  it('activa un contrato DRAFT → status ACTIVE + update llamado sin tocar contractFileUrl', async () => {
    mocks.prisma.contract.findUnique.mockResolvedValue({ id: 'c-1', status: 'DRAFT' });
    mocks.prisma.contract.update.mockResolvedValue({ id: 'c-1', status: 'ACTIVE' });

    const result = await contractService.activateContract('c-1');

    expect(result).toEqual({ id: 'c-1', status: 'ACTIVE' });
    expect(mocks.prisma.contract.update).toHaveBeenCalledOnce();
    expect(mocks.prisma.contract.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { status: 'ACTIVE' },
    });
  });

  it('contrato inexistente → throw "Contrato no encontrado" y NO llama update', async () => {
    mocks.prisma.contract.findUnique.mockResolvedValue(null);

    await expect(contractService.activateContract('nope')).rejects.toThrow('Contrato no encontrado');
    expect(mocks.prisma.contract.update).not.toHaveBeenCalled();
  });

  it('contrato ya ACTIVE → throw "El contrato ya está activo" sin llamar update', async () => {
    mocks.prisma.contract.findUnique.mockResolvedValue({ id: 'c-1', status: 'ACTIVE' });

    await expect(contractService.activateContract('c-1')).rejects.toThrow('El contrato ya está activo');
    expect(mocks.prisma.contract.update).not.toHaveBeenCalled();
  });
});
