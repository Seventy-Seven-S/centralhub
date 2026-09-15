import { describe, it, expect } from 'vitest';
import { componerTotales } from '../totalesProyecto';

describe('componerTotales', () => {
  it('los ingresos son lo cobrado a clientes MÁS lo que no viene de un cliente', () => {
    expect(componerTotales({ pagos: 100, otros: 45, egresos: 30 })).toEqual({
      totalIngresos: 145, otrosIngresos: 45, totalEgresos: 30, diferencia: 115,
    });
  });

  it('sin otros ingresos el total es solo lo cobrado', () => {
    expect(componerTotales({ pagos: 100, otros: 0, egresos: 30 }).totalIngresos).toBe(100);
  });

  it('la diferencia puede ser negativa', () => {
    expect(componerTotales({ pagos: 10, otros: 0, egresos: 50 }).diferencia).toBe(-40);
  });

  it('tolera nulos: un proyecto sin movimientos queda en ceros, no en NaN', () => {
    expect(componerTotales({ pagos: null, otros: null, egresos: null })).toEqual({
      totalIngresos: 0, otrosIngresos: 0, totalEgresos: 0, diferencia: 0,
    });
  });

  it('convierte los Decimal que Prisma entrega como texto', () => {
    const r = componerTotales({ pagos: 100, otros: 0, egresos: '30.50' as never });
    expect(r.totalEgresos).toBe(30.5);
    expect(r.diferencia).toBe(69.5);
  });

  it('redondea a centavos: sumar flotantes deja colas de centésimas', () => {
    const r = componerTotales({ pagos: 0.1, otros: 0.2, egresos: 0 });
    expect(r.totalIngresos).toBe(0.3);
  });
});
