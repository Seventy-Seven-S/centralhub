import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({ registrarPagoMensualidad: vi.fn() }));
vi.mock('../../services/payment.service', () => ({
  default: { registrarPagoMensualidad: mocks.registrarPagoMensualidad },
  paymentService: { registrarPagoMensualidad: mocks.registrarPagoMensualidad },
}));

import paymentController from '../payment.controller';

function run(body: any, user: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  return { res, promesa: paymentController.create({ body, user } as unknown as Request, res) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.registrarPagoMensualidad.mockResolvedValue({ payment: { id: 'p1' }, cuotasAfectadas: [], reciboId: null });
});

describe('POST /payments — atribución de quién cobró', () => {
  it('estampa el userId DEL TOKEN en el pago', async () => {
    const { promesa } = run(
      { contractId: 'c1', amount: 1000, paymentDate: '2026-09-09', paymentMethod: 'CASH', idempotencyKey: 'k1' },
      { userId: 'marisol-id', role: 'MANAGER' },
    );
    await promesa;

    expect(mocks.registrarPagoMensualidad).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'marisol-id' }),
    );
  });

  it('IGNORA un userId inyectado en el body: nadie atribuye un cobro a otra persona', async () => {
    const { promesa } = run(
      { contractId: 'c1', amount: 1000, paymentDate: '2026-09-09', paymentMethod: 'CASH', idempotencyKey: 'k2',
        userId: 'otra-persona-id', createdBy: 'otra-persona-id' },
      { userId: 'marisol-id', role: 'MANAGER' },
    );
    await promesa;

    const enviado = mocks.registrarPagoMensualidad.mock.calls[0][0];
    expect(enviado.userId).toBe('marisol-id');
    expect(enviado.createdBy).toBeUndefined();
  });
});
