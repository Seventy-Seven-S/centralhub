import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const lotService = { getLots: vi.fn(), getLotById: vi.fn(), getIneDocumentsByLotIds: vi.fn() };
  return { lotService };
});

vi.mock('../../services/lot.service', () => ({ default: mocks.lotService }));

import lotController from '../lot.controller';

const LOT_AJENO = {
  id: 'lot-1', status: 'RESERVED',
  reservedByName: 'Juan Pérez', reservedByPhone: '8681234567', reservedByEmail: 'juan@example.com',
  reservedByAgentId: 'agent-B',
};
const LOT_PROPIO = {
  id: 'lot-2', status: 'RESERVED',
  reservedByName: 'Ana López', reservedByPhone: '8687654321', reservedByEmail: 'ana@example.com',
  reservedByAgentId: 'agent-A',
};

function runGetAll(user?: { role: string; userId: string }) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const req = { query: {}, user } as unknown as Request;
  return lotController.getAll(req, res).then(() => res);
}

function runGetById(id: string, user?: { role: string; userId: string }) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const req = { params: { id }, user } as unknown as Request;
  return lotController.getById(req, res).then(() => res);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lotService.getLots.mockResolvedValue([LOT_AJENO, LOT_PROPIO]);
  mocks.lotService.getLotById.mockImplementation((id: string) =>
    Promise.resolve(id === 'lot-1' ? LOT_AJENO : LOT_PROPIO),
  );
  mocks.lotService.getIneDocumentsByLotIds.mockResolvedValue(new Map());
});

describe('GET /lots — scoping de PII por rol+ownership (mismo filtro que GET /lots/:id)', () => {
  it('AGENT en la lista: PII del apartado ajeno viene null; PII del propio viene completa', async () => {
    const res = await runGetAll({ role: 'AGENT', userId: 'agent-A' });

    const data = (res.json as any).mock.calls[0][0].data;
    const ajeno = data.find((l: any) => l.id === 'lot-1');
    const propio = data.find((l: any) => l.id === 'lot-2');

    expect(ajeno.reservedByName).toBeNull();
    expect(ajeno.reservedByPhone).toBeNull();
    expect(ajeno.reservedByEmail).toBeNull();
    expect(ajeno.reservedByAgentId).toBeNull();
    expect(ajeno.status).toBe('RESERVED'); // status sí se conserva

    expect(propio.reservedByName).toBe('Ana López');
    expect(propio.reservedByAgentId).toBe('agent-A');
  });

  it('ADMIN en la lista: ve toda la PII sin cambios (no-regresión)', async () => {
    const res = await runGetAll({ role: 'ADMIN', userId: 'admin-1' });

    const data = (res.json as any).mock.calls[0][0].data;
    const ajeno = data.find((l: any) => l.id === 'lot-1');
    expect(ajeno.reservedByName).toBe('Juan Pérez');
    expect(ajeno.reservedByPhone).toBe('8681234567');
    expect(ajeno.reservedByAgentId).toBe('agent-B');
  });

  it('MANAGER en la lista: ve toda la PII sin cambios (no-regresión)', async () => {
    const res = await runGetAll({ role: 'MANAGER', userId: 'mgr-1' });

    const data = (res.json as any).mock.calls[0][0].data;
    const ajeno = data.find((l: any) => l.id === 'lot-1');
    expect(ajeno.reservedByName).toBe('Juan Pérez');
  });

  it('mismo filtro en el detalle: AGENT viendo GET /lots/:id de un apartado ajeno → PII null', async () => {
    const res = await runGetById('lot-1', { role: 'AGENT', userId: 'agent-A' });

    const data = (res.json as any).mock.calls[0][0].data;
    expect(data.reservedByName).toBeNull();
    expect(data.reservedByPhone).toBeNull();
    expect(data.reservedByEmail).toBeNull();
    expect(data.reservedByAgentId).toBeNull();
  });

  it('mismo filtro en el detalle: AGENT viendo su propio apartado por GET /lots/:id → PII completa', async () => {
    const res = await runGetById('lot-2', { role: 'AGENT', userId: 'agent-A' });

    const data = (res.json as any).mock.calls[0][0].data;
    expect(data.reservedByName).toBe('Ana López');
  });

  it('ADMIN en el detalle: PII completa sin cambios (no-regresión)', async () => {
    const res = await runGetById('lot-1', { role: 'ADMIN', userId: 'admin-1' });

    const data = (res.json as any).mock.calls[0][0].data;
    expect(data.reservedByName).toBe('Juan Pérez');
  });
});
