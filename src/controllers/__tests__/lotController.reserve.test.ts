import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const lotService = { reserveLot: vi.fn() };
  return { lotService };
});

vi.mock('../../services/lot.service', () => ({ default: mocks.lotService }));

import lotController from '../lot.controller';

function runReserve(over: { user?: any; body?: any } = {}) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const req = {
    params: { id: 'lot-1' },
    body: { deposit: '0', clientName: 'Juan', clientPhone: '8681234567', ...over.body },
    user: { userId: 'user-1', role: 'AGENT', ...over.user },
  } as unknown as Request;
  return lotController.reserve(req, res).then(() => res);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lotService.reserveLot.mockResolvedValue({ id: 'lot-1', status: 'RESERVED' });
});

describe('reserve — reservedByAgentId atado al token cuando el rol es AGENT', () => {
  it('AGENT aparta → reservedByAgentId es su propio userId, sin importar lo que mande el body', async () => {
    await runReserve({
      user: { userId: 'agent-real-7', role: 'AGENT' },
      body: { agentId: 'otro-agente-999' }, // intento de atribuir a otro
    });

    expect(mocks.lotService.reserveLot).toHaveBeenCalledOnce();
    const dataArg = mocks.lotService.reserveLot.mock.calls[0][1];
    expect(dataArg.agentId).toBe('agent-real-7');
  });

  it('AGENT aparta sin mandar agentId en el body → igual queda forzado a su propio userId (nunca null)', async () => {
    await runReserve({ user: { userId: 'agent-real-7', role: 'AGENT' }, body: {} });

    const dataArg = mocks.lotService.reserveLot.mock.calls[0][1];
    expect(dataArg.agentId).toBe('agent-real-7');
  });

  it('ADMIN aparta con agentId X en el body → se respeta X (comportamiento actual, sin cambios)', async () => {
    await runReserve({
      user: { userId: 'admin-1', role: 'ADMIN' },
      body: { agentId: 'agent-X' },
    });

    const dataArg = mocks.lotService.reserveLot.mock.calls[0][1];
    expect(dataArg.agentId).toBe('agent-X');
  });

  it('MANAGER aparta sin seleccionar asesor → queda sin asignar (undefined/null), no se fuerza al propio token', async () => {
    await runReserve({ user: { userId: 'manager-1', role: 'MANAGER' }, body: {} });

    const dataArg = mocks.lotService.reserveLot.mock.calls[0][1];
    expect(dataArg.agentId).toBeFalsy();
    expect(dataArg.agentId).not.toBe('manager-1');
  });

  it('MANAGER aparta con agentId X en el body → se respeta X', async () => {
    await runReserve({ user: { userId: 'manager-1', role: 'MANAGER' }, body: { agentId: 'agent-Y' } });

    const dataArg = mocks.lotService.reserveLot.mock.calls[0][1];
    expect(dataArg.agentId).toBe('agent-Y');
  });
});
