import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma = {
    cuota: { findUnique: vi.fn() },
  };
  const paymentService = {
    registrarPagoMensualidad: vi.fn().mockResolvedValue({ payment: { id: 'payment-1' }, cuotasAfectadas: [1] }),
  };
  return { prisma, paymentService };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  CuotaStatus: { PENDIENTE: 'PENDIENTE', PAGADA: 'PAGADA', MORA: 'MORA' },
  PaymentMethod: { TRANSFER: 'TRANSFER', CASH: 'CASH' },
}));
vi.mock('../payment.service', () => ({ default: mocks.paymentService }));

import cuotaService from '../cuota.service';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.cuota.findUnique.mockResolvedValue({ id: 'cuota-1', contractId: 'contract-1', status: 'PENDIENTE' });
  mocks.paymentService.registrarPagoMensualidad.mockResolvedValue({ payment: { id: 'payment-1' }, cuotasAfectadas: [1] });
});

describe('payCuota — segunda entrada al mismo flujo (debe quedar protegida por idempotencia igual que POST /payments)', () => {
  it('reenvía idempotencyKey tal cual a registrarPagoMensualidad', async () => {
    await cuotaService.payCuota('cuota-1', {
      montoPagado: 8000,
      fechaPago: new Date('2026-08-16'),
      idempotencyKey: 'key-desde-cuota-modal',
    });

    expect(mocks.paymentService.registrarPagoMensualidad).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'key-desde-cuota-modal' }),
    );
  });

  it('sin idempotencyKey → no se inventa una server-side, se propaga undefined (falla en payment.service, misma fuente de verdad)', async () => {
    await cuotaService.payCuota('cuota-1', {
      montoPagado: 8000,
      fechaPago: new Date('2026-08-16'),
    } as any);

    const arg = mocks.paymentService.registrarPagoMensualidad.mock.calls[0][0];
    expect(arg.idempotencyKey).toBeUndefined();
  });
});

describe('payCuota — reciboId (QR de validación) se propaga en el resultado', () => {
  it('el reciboId que devuelve registrarPagoMensualidad llega hasta el resultado de payCuota', async () => {
    mocks.paymentService.registrarPagoMensualidad.mockResolvedValue({
      payment: { id: 'payment-1' }, cuotasAfectadas: [1], reciboId: 'recibo-abc',
    });

    const result = await cuotaService.payCuota('cuota-1', {
      montoPagado: 8000,
      fechaPago: new Date('2026-08-16'),
      idempotencyKey: 'key-1',
    });

    expect((result as any).reciboId).toBe('recibo-abc');
  });
});
