import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const prisma = {
    client: { update: vi.fn() },
  };
  return { prisma };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));

import { updateClient } from '../client.controller';

function runHandler(req: Partial<Request>) {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn();
  // updateClient está envuelto en asyncHandler → devuelve void y captura la promesa.
  (updateClient as unknown as (r: Request, s: Response, n: () => void) => void)(
    req as Request,
    res,
    next
  );
  return { res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.client.update.mockResolvedValue({ id: 'cli-1' });
});

describe('updateClient — whitelist anti mass-assignment', () => {
  it('solo pasa campos editables al update y descarta los prohibidos', async () => {
    runHandler({
      params: { id: 'cli-1' },
      body: {
        firstName: 'Ana',
        lastName: 'López',
        email: 'ana@example.com',
        phone: '8681112222',
        whatsappPhone: '8683334444',
        address: 'Calle 1',
        city: 'Torreón',
        state: 'Coahuila',
        zipCode: '27000',
        ine: '1234567890123',
        curp: 'LOPA900101MCLLNN09',
        estadoCivil: 'Soltera',
        lugarNacimiento: 'Torreón',
        status: 'ACTIVE',
        notes: 'cliente preferente',
        // Campos prohibidos que NO deben llegar al update:
        id: 'hackeado',
        globalCode: 'CLI-999999',
        createdAt: '2000-01-01T00:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z',
        contracts: [{ id: 'x' }],
        payments: [{ id: 'y' }],
        projects: [{ id: 'z' }],
      },
    });

    // Espera a que la promesa interna del asyncHandler resuelva.
    await vi.waitFor(() => expect(mocks.prisma.client.update).toHaveBeenCalledOnce());

    const arg = mocks.prisma.client.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'cli-1' });

    const data = arg.data;
    // Campos editables presentes:
    expect(data).toEqual({
      firstName: 'Ana',
      lastName: 'López',
      email: 'ana@example.com',
      phone: '8681112222',
      whatsappPhone: '8683334444',
      address: 'Calle 1',
      city: 'Torreón',
      state: 'Coahuila',
      zipCode: '27000',
      ine: '1234567890123',
      curp: 'LOPA900101MCLLNN09',
      estadoCivil: 'Soltera',
      lugarNacimiento: 'Torreón',
      status: 'ACTIVE',
      notes: 'cliente preferente',
    });
    // Campos prohibidos ausentes:
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('globalCode');
    expect(data).not.toHaveProperty('createdAt');
    expect(data).not.toHaveProperty('updatedAt');
    expect(data).not.toHaveProperty('contracts');
    expect(data).not.toHaveProperty('payments');
    expect(data).not.toHaveProperty('projects');
  });

  it('solo incluye en data los campos enviados (update parcial)', async () => {
    runHandler({
      params: { id: 'cli-2' },
      body: { phone: '8689998888', globalCode: 'CLI-000001' },
    });

    await vi.waitFor(() => expect(mocks.prisma.client.update).toHaveBeenCalledOnce());

    const data = mocks.prisma.client.update.mock.calls[0][0].data;
    expect(data).toEqual({ phone: '8689998888' });
  });
});
