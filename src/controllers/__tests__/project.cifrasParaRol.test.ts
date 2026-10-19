import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database', () => ({ prisma: {} }));

import { cifrasParaRol } from '../project.controller';

const PROYECTO = {
  id: 'p-1', name: 'JSA 1', totalContratos: 80, totalLotes: 113, lotesVendidos: 80, lotesDisponibles: 30,
  valorTotal: 25_000_000, pendientePorEntregar: 120_000,
  totalIngresos: 9_000_000, otrosIngresos: 50_000, totalEgresos: 1_200_000, diferencia: 7_800_000,
};

describe('cifrasParaRol — el AGENT no recibe ingresos ni egresos', () => {
  it('ADMIN y MANAGER: sin cambios', () => {
    expect(cifrasParaRol(PROYECTO, 'ADMIN')).toEqual(PROYECTO);
    expect(cifrasParaRol(PROYECTO, 'MANAGER')).toEqual(PROYECTO);
  });

  it('AGENT: se van ingresos, otros ingresos, egresos y diferencia', () => {
    const r = cifrasParaRol(PROYECTO, 'AGENT') as Record<string, unknown>;
    for (const campo of ['totalIngresos', 'otrosIngresos', 'totalEgresos', 'diferencia']) {
      expect(r).not.toHaveProperty(campo);
    }
  });

  it('AGENT conserva lo que su tarjeta sí muestra (contratos, lotes, valor total, pendiente por entregar)', () => {
    expect(cifrasParaRol(PROYECTO, 'AGENT')).toMatchObject({
      totalContratos: 80, lotesVendidos: 80, lotesDisponibles: 30, valorTotal: 25_000_000, pendientePorEntregar: 120_000,
    });
  });
});
