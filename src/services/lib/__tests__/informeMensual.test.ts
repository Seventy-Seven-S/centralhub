import { describe, it, expect } from 'vitest';
import { construirInformeMensual } from '../informeMensual';

const m = (fecha: string, monto: number) => ({ fecha: new Date(`${fecha}T12:00:00Z`), monto });
const hasta = new Date('2026-03-15T12:00:00Z');

describe('construirInformeMensual', () => {
  it('suma ingresos y egresos por mes', () => {
    const r = construirInformeMensual([m('2026-01-05', 100), m('2026-01-20', 50)], [m('2026-01-10', 30), m('2026-02-01', 20)], hasta);
    expect(r.filas).toEqual([
      { periodo: '2026-01', mes: 'Ene 2026', ingresos: 150, egresos: 30 },
      { periodo: '2026-02', mes: 'Feb 2026', ingresos: 0, egresos: 20 },
      { periodo: '2026-03', mes: 'Mar 2026', ingresos: 0, egresos: 0 },
    ]);
    expect(r.totales).toEqual({ ingresos: 150, egresos: 50 });
  });

  it('empieza en el primer mes con CUALQUIER movimiento, aunque sea solo un gasto', () => {
    const r = construirInformeMensual([m('2026-02-01', 10)], [m('2025-12-20', 5)], hasta);
    expect(r.filas[0].periodo).toBe('2025-12');
  });

  it('rellena los meses sin movimiento con cero', () => {
    const r = construirInformeMensual([m('2025-12-01', 1), m('2026-03-01', 1)], [], hasta);
    expect(r.filas.map(f => f.periodo)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03']);
  });

  it('respeta los montos negativos (devoluciones migradas)', () => {
    const r = construirInformeMensual([m('2026-01-01', 100), m('2026-01-02', -40)], [], hasta);
    expect(r.filas[0].ingresos).toBe(60);
  });

  it('redondea a centavos para no arrastrar basura de flotantes', () => {
    const r = construirInformeMensual([m('2026-01-01', 0.1), m('2026-01-02', 0.2)], [], hasta);
    expect(r.filas[0].ingresos).toBe(0.3);
    expect(r.totales.ingresos).toBe(0.3);
  });

  it('acepta montos como texto (Prisma entrega Decimal así)', () => {
    const r = construirInformeMensual([], [{ fecha: new Date('2026-01-01T12:00:00Z'), monto: '12.50' }], hasta);
    expect(r.totales.egresos).toBe(12.5);
  });

  it('sin movimientos → informe vacío', () => {
    expect(construirInformeMensual([], [], hasta)).toEqual({ filas: [], totales: { ingresos: 0, egresos: 0 } });
  });

  it('incluye un movimiento con fecha futura en vez de perderlo', () => {
    const r = construirInformeMensual([m('2026-05-01', 7)], [], hasta);
    expect(r.filas.at(-1)).toEqual({ periodo: '2026-05', mes: 'May 2026', ingresos: 7, egresos: 0 });
    expect(r.totales.ingresos).toBe(7);
  });
});
