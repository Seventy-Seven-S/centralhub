import { describe, it, expect } from 'vitest';
import { buildCuotaRows } from '../cuotaSchedule';

describe('buildCuotaRows', () => {
  it('genera una fila por cuota, numeradas desde 1, con vencimiento mensual a partir de startDate', () => {
    const rows = buildCuotaRows({
      contractId: 'c-1',
      startDate: new Date('2026-07-10T00:00:00'),
      cuotaAmounts: [4416.67, 4416.67, 4416.66],
      idFactory: () => 'id',
    });
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.numeroCuota)).toEqual([1, 2, 3]);
    expect(rows.map(r => r.montoEsperado)).toEqual([4416.67, 4416.67, 4416.66]);
    expect(rows[0].fechaVencimiento.getMonth()).toBe(7); // agosto
    expect(rows[2].fechaVencimiento.getMonth()).toBe(9); // octubre
    expect(rows.every(r => r.status === 'PENDIENTE' && r.montoPagado === 0 && r.contractId === 'c-1')).toBe(true);
  });

  it('un startDate a fin de mes no produce fechas inválidas (29-ene + 1 mes cae en marzo, no en 29-feb)', () => {
    const rows = buildCuotaRows({
      contractId: 'c-1',
      startDate: new Date('2025-01-29T00:00:00'),
      cuotaAmounts: [1, 1],
      idFactory: () => 'id',
    });
    expect(rows.every(r => !isNaN(r.fechaVencimiento.getTime()))).toBe(true);
  });

  it('cada fila lleva un id distinto de la fábrica', () => {
    let n = 0;
    const rows = buildCuotaRows({
      contractId: 'c-1',
      startDate: new Date('2026-01-01T00:00:00'),
      cuotaAmounts: [1, 1, 1],
      idFactory: () => `id-${++n}`,
    });
    expect(rows.map(r => r.id)).toEqual(['id-1', 'id-2', 'id-3']);
  });
});
