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

  it('startDate 31-ene: un vencimiento por mes calendario, sin saltar ni repetir meses (caso real V205)', () => {
    const rows = buildCuotaRows({
      contractId: 'c-1',
      startDate: new Date('2025-01-31T00:00:00'),
      cuotaAmounts: new Array(12).fill(1),
      idFactory: () => 'id',
    });
    const ym = rows.map(r => `${r.fechaVencimiento.getFullYear()}-${String(r.fechaVencimiento.getMonth() + 1).padStart(2, '0')}`);
    expect(ym).toEqual(['2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']);
    // El día se recorta al último del mes cuando el mes es más corto.
    expect(rows[0].fechaVencimiento.getDate()).toBe(28); // feb 2025
    expect(rows[2].fechaVencimiento.getDate()).toBe(30); // abr
    expect(rows[1].fechaVencimiento.getDate()).toBe(31); // mar
    expect(rows.map(r => r.mes)).toEqual([
      'febrero de 2025', 'marzo de 2025', 'abril de 2025', 'mayo de 2025', 'junio de 2025', 'julio de 2025',
      'agosto de 2025', 'septiembre de 2025', 'octubre de 2025', 'noviembre de 2025', 'diciembre de 2025', 'enero de 2026',
    ]);
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
