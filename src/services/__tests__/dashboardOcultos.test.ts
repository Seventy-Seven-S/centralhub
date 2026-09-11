import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prueba de contrato, no de implementación: lo que importa es que NINGUNA
// consulta que suma dinero se mande sin el filtro de proyectos ocultos.
const mocks = vi.hoisted(() => {
  const spy = { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() };
  const prisma = {
    contract: { count: spy.count, findMany: spy.findMany, groupBy: spy.groupBy },
    payment:  { aggregate: spy.aggregate, findMany: spy.findMany },
    cuota:    { count: spy.count, findMany: spy.findMany, groupBy: spy.groupBy },
    lot:      { count: spy.count },
    expense:  { aggregate: spy.aggregate },
  };
  return { prisma, spy };
});
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  CuotaStatus: { PENDIENTE: 'PENDIENTE', PAGADA: 'PAGADA' },
  LotStatus: { AVAILABLE: 'AVAILABLE', RESERVED: 'RESERVED', SOLD: 'SOLD', UNAVAILABLE: 'UNAVAILABLE' },
  ProjectStatus: { PLANNING: 'PLANNING', ACTIVE: 'ACTIVE', COMPLETED: 'COMPLETED', SUSPENDED: 'SUSPENDED', HIDDEN: 'HIDDEN' },
  UserRole: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', AGENT: 'AGENT', VIEWER: 'VIEWER' },
}));

import dashboardService from '../dashboard.service';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.spy.count.mockResolvedValue(0);
  mocks.spy.findMany.mockResolvedValue([]);
  mocks.spy.groupBy.mockResolvedValue([]);
  mocks.spy.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: 0 });
});

/** ¿El objeto menciona HIDDEN en algún nivel? */
const excluyeOcultos = (o: any): boolean => JSON.stringify(o ?? {}).includes('HIDDEN');

describe('dashboard — el dinero de un proyecto oculto NUNCA entra en los totales', () => {
  it('sin proyecto elegido, TODA consulta que suma dinero excluye los ocultos', async () => {
    await dashboardService.getSummary();

    const sumas = mocks.spy.aggregate.mock.calls.map(c => c[0]);
    expect(sumas.length).toBeGreaterThan(0);
    for (const where of sumas) {
      expect(excluyeOcultos(where)).toBe(true);
    }
  });

  it('los conteos de contratos, cuotas y lotes también los excluyen', async () => {
    await dashboardService.getSummary();
    for (const c of mocks.spy.count.mock.calls) {
      expect(excluyeOcultos(c[0])).toBe(true);
    }
  });

  it('al elegir un proyecto se respeta ese proyecto y no se mezcla con el filtro', async () => {
    await dashboardService.getSummary('proj-1');
    for (const c of [...mocks.spy.aggregate.mock.calls, ...mocks.spy.count.mock.calls]) {
      const s = JSON.stringify(c[0] ?? {});
      expect(s).toContain('proj-1');
      expect(s).not.toContain('HIDDEN');
    }
  });
});
