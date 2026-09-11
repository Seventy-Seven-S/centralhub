import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({ crear: vi.fn(), listar: vi.fn(), obtener: vi.fn() }));
vi.mock('../../services/traspaso.service', () => ({ default: mocks, traspasoService: mocks }));

import traspasoController from '../traspaso.controller';

function run(body: any, user: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  return { res, promesa: traspasoController.crear({ body, user } as unknown as Request, res) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.crear.mockResolvedValue({ id: 't1', numero: 7 });
});

describe('POST /traspasos', () => {
  const body = {
    contratoOrigenId: 'c1', clienteNuevoId: 'cli2',
    lotIdsDestino: ['l1'], projectIdDestino: 'p1', montoRespetado: '10000',
  };

  it('toma el userId del TOKEN, nunca del body', async () => {
    const { promesa } = run({ ...body, userId: 'suplantado' }, { userId: 'u-real', role: 'ADMIN' });
    await promesa;
    expect(mocks.crear).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-real' }));
  });

  it('convierte el monto a número', async () => {
    const { promesa } = run(body, { userId: 'u-real', role: 'ADMIN' });
    await promesa;
    expect(mocks.crear).toHaveBeenCalledWith(expect.objectContaining({ montoRespetado: 10000 }));
  });

  it('normaliza lotIdsDestino cuando multipart lo manda como string suelto', async () => {
    const { promesa } = run({ ...body, lotIdsDestino: 'l1' }, { userId: 'u', role: 'ADMIN' });
    await promesa;
    expect(mocks.crear).toHaveBeenCalledWith(expect.objectContaining({ lotIdsDestino: ['l1'] }));
  });

  it('devuelve 201 con el traspaso creado', async () => {
    const { res, promesa } = run(body, { userId: 'u-real', role: 'ADMIN' });
    await promesa;
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('un error del servicio sale como 400 con su mensaje', async () => {
    mocks.crear.mockRejectedValue(new Error('El lote destino no está disponible'));
    const { res, promesa } = run(body, { userId: 'u-real', role: 'ADMIN' });
    await promesa;
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'El lote destino no está disponible' }));
  });
});
