import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma = {
    payment: { findUnique: vi.fn(), update: vi.fn() },
  };
  return { prisma };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  PaymentStatus: { PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', CANCELED: 'CANCELED' },
  PaymentType: { INSTALLMENT: 'INSTALLMENT' },
  CuotaStatus: { PENDIENTE: 'PENDIENTE', PAGADA: 'PAGADA', MORA: 'MORA' },
  ContractStatus: { ACTIVE: 'ACTIVE', IN_MORA: 'IN_MORA', CANCELED: 'CANCELED' },
}));
vi.mock('../notification.service', () => ({ default: { createNotification: vi.fn() } }));

import paymentService from '../payment.service';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.payment.findUnique.mockResolvedValue({ id: 'payment-1', amount: 8000, status: 'CONFIRMED' });
  mocks.prisma.payment.update.mockResolvedValue({ id: 'payment-1' });
});

describe('updatePayment — congelado (Tanda 1): monto y status→CANCELED', () => {
  it('editar amount → rechaza con error claro, nunca llama a prisma.payment.update', async () => {
    await expect(paymentService.updatePayment('payment-1', { amount: 9999 }))
      .rejects.toThrow(/monto.*no.*soportad|no soportado/i);
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled();
  });

  it('cambiar status a CANCELED → rechaza con error claro, nunca llama a prisma.payment.update', async () => {
    await expect(paymentService.updatePayment('payment-1', { status: 'CANCELED' as any }))
      .rejects.toThrow(/cancel|no soportado/i);
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled();
  });

  it('cambiar status a algo distinto de CANCELED (ej. CONFIRMED) sigue permitido', async () => {
    await paymentService.updatePayment('payment-1', { status: 'CONFIRMED' as any });
    expect(mocks.prisma.payment.update).toHaveBeenCalledOnce();
  });

  it('editar notes/reference/paymentMethod sigue funcionando (no tocan la cascada)', async () => {
    await paymentService.updatePayment('payment-1', { notes: 'nota nueva', reference: 'REF-1', paymentMethod: 'CASH' as any });
    expect(mocks.prisma.payment.update).toHaveBeenCalledOnce();
    const data = mocks.prisma.payment.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ notes: 'nota nueva', referenceNumber: 'REF-1', paymentMethod: 'CASH' });
    expect(data).not.toHaveProperty('amount');
  });

  it('pago inexistente sigue lanzando error', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue(null);
    await expect(paymentService.updatePayment('nope', { notes: 'x' })).rejects.toThrow(/no encontrado/i);
  });
});
