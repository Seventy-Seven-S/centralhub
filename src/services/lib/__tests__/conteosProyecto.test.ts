import { describe, it, expect } from 'vitest';
import { CONTRATOS_VIVOS, resumirLotes } from '../conteosProyecto';

describe('CONTRATOS_VIVOS', () => {
  it('deja fuera los contratos que ya no representan una venta en pie', () => {
    expect(CONTRATOS_VIVOS).toEqual(['SIGNED', 'ACTIVE', 'IN_MORA', 'COMPLETED']);
    for (const muerto of ['DRAFT', 'CANCELED', 'RESCISSION', 'TRASPASADO']) {
      expect(CONTRATOS_VIVOS).not.toContain(muerto);
    }
  });
});

describe('resumirLotes', () => {
  it('reparte los lotes por estado y el total los incluye a todos', () => {
    const r = resumirLotes([
      { status: 'SOLD', _count: 140 },
      { status: 'UNAVAILABLE', _count: 24 },
    ]);
    expect(r).toEqual({ total: 164, vendidos: 140, disponibles: 0, reservados: 0, noDisponibles: 24 });
  });

  it('cuenta los cuatro estados', () => {
    const r = resumirLotes([
      { status: 'SOLD', _count: 217 },
      { status: 'AVAILABLE', _count: 1 },
      { status: 'RESERVED', _count: 3 },
      { status: 'UNAVAILABLE', _count: 3 },
    ]);
    expect(r.total).toBe(224);
    expect(r.reservados).toBe(3);
  });

  it('un proyecto sin lotes cargados da ceros, no explota', () => {
    expect(resumirLotes([])).toEqual({ total: 0, vendidos: 0, disponibles: 0, reservados: 0, noDisponibles: 0 });
  });
});
