import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({ getPayments: vi.fn() }));
vi.mock('../../services/payment.service', () => ({
  default: { getPayments: mocks.getPayments },
  paymentService: { getPayments: mocks.getPayments },
}));

import paymentController from '../payment.controller';

function run(query: any, user: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  return { res, promesa: paymentController.getAll({ query, user } as unknown as Request, res) };
}

beforeEach(() => { vi.clearAllMocks(); mocks.getPayments.mockResolvedValue([]); });

describe('GET /payments — el listado global es del negocio, el por-contrato es operativo', () => {
  it('MANAGER puede listar los pagos DE UN CONTRATO (lo necesita para cobrar)', async () => {
    const { res, promesa } = run({ contractId: 'c1' }, { userId: 'u1', role: 'MANAGER' });
    await promesa;
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mocks.getPayments).toHaveBeenCalled();
  });

  it('MANAGER NO puede listar TODOS los pagos: es el ingreso del negocio', async () => {
    const { res, promesa } = run({ projectId: 'p1' }, { userId: 'u1', role: 'MANAGER' });
    await promesa;
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.getPayments).not.toHaveBeenCalled();
  });

  it('tampoco sin ningún filtro', async () => {
    const { res, promesa } = run({}, { userId: 'u1', role: 'MANAGER' });
    await promesa;
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.getPayments).not.toHaveBeenCalled();
  });

  it('un contractId vacío no sirve para colarse', async () => {
    const { res, promesa } = run({ contractId: '' }, { userId: 'u1', role: 'MANAGER' });
    await promesa;
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('ADMIN sí puede listar todo', async () => {
    const { res, promesa } = run({ projectId: 'p1' }, { userId: 'a1', role: 'ADMIN' });
    await promesa;
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mocks.getPayments).toHaveBeenCalled();
  });
});
