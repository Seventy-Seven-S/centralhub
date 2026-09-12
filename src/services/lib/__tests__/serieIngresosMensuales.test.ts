import { describe, it, expect } from 'vitest';
import { construirSerieMensual } from '../serieIngresosMensuales';

const p = (fecha: string, amount: number) => ({ paymentDate: new Date(`${fecha}T12:00:00Z`), amount });
const hasta = new Date('2026-03-15T12:00:00Z');

describe('construirSerieMensual', () => {
  it('agrupa por mes y suma', () => {
    const s = construirSerieMensual([p('2026-01-05', 100), p('2026-01-20', 50), p('2026-02-01', 30)], hasta);
    expect(s).toEqual([
      { periodo: '2026-01', mes: 'Ene 2026', total: 150 },
      { periodo: '2026-02', mes: 'Feb 2026', total: 30 },
      { periodo: '2026-03', mes: 'Mar 2026', total: 0 },
    ]);
  });

  it('RELLENA los meses sin ingresos: si no, "últimos 6 meses" abarcaría más de 6', () => {
    const s = construirSerieMensual([p('2025-12-01', 100), p('2026-03-01', 200)], hasta);
    expect(s.map(x => x.periodo)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03']);
    expect(s.map(x => x.total)).toEqual([100, 0, 0, 200]);
  });

  it('llega hasta el mes actual aunque no haya habido pagos desde hace rato', () => {
    const s = construirSerieMensual([p('2025-11-10', 100)], hasta);
    expect(s.at(-1)).toEqual({ periodo: '2026-03', mes: 'Mar 2026', total: 0 });
  });

  it('cruza el cambio de año sin saltarse diciembre ni enero', () => {
    const s = construirSerieMensual([p('2025-11-01', 1), p('2026-01-01', 1)], hasta);
    expect(s.map(x => x.mes)).toEqual(['Nov 2025', 'Dic 2025', 'Ene 2026', 'Feb 2026', 'Mar 2026']);
  });

  it('sin pagos → serie vacía, no un mes en cero inventado', () => {
    expect(construirSerieMensual([], hasta)).toEqual([]);
  });

  it('queda en orden cronológico aunque los pagos lleguen desordenados', () => {
    const s = construirSerieMensual([p('2026-03-01', 5), p('2026-01-01', 1), p('2026-02-01', 3)], hasta);
    expect(s.map(x => x.total)).toEqual([1, 3, 5]);
  });

  it('un monto nulo no rompe la suma', () => {
    const s = construirSerieMensual([{ paymentDate: new Date('2026-03-01T12:00:00Z'), amount: null as any }], hasta);
    expect(s.at(-1)!.total).toBe(0);
  });
});
