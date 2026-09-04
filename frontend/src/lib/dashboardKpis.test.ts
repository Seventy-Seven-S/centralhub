import { describe, it, expect } from 'vitest';
import { buildDashboardKpis } from './dashboardKpis';

describe('buildDashboardKpis', () => {
  it('devuelve exactamente 3 tarjetas en orden: Ingresos totales, Egresos totales, Diferencia', () => {
    const kpis = buildDashboardKpis({ ingresos: { total: 31218225, totalPagos: 3660 }, gastos: { total: 30576970.67, count: 84 } });
    expect(kpis.map(k => k.title)).toEqual(['Ingresos totales', 'Egresos totales', 'Diferencia']);
  });

  it('Diferencia = ingresos − egresos, verde si ≥ 0 y roja si < 0, con subtítulo "Ingresos − Egresos"', () => {
    const negativa = buildDashboardKpis({ ingresos: { total: 100, totalPagos: 1 }, gastos: { total: 150 } })[2];
    expect(negativa.amount).toBe(-50);
    expect(negativa.accent).toBe('#EF4444');
    expect(negativa.subtitle).toBe('Ingresos − Egresos');

    const positiva = buildDashboardKpis({ ingresos: { total: 200, totalPagos: 1 }, gastos: { total: 150 } })[2];
    expect(positiva.amount).toBe(50);
    expect(positiva.accent).toBe('#22C55E');
  });

  it('Egresos muestra el conteo de gastos si el backend lo trae y sin subtítulo si no', () => {
    const con = buildDashboardKpis({ ingresos: { total: 1, totalPagos: 1 }, gastos: { total: 5, count: 3 } })[1];
    expect(con.amount).toBe(5);
    expect(con.subtitle).toBe('3 gastos registrados');
    const sin = buildDashboardKpis({ ingresos: { total: 1, totalPagos: 1 }, gastos: { total: 5 } })[1];
    expect(sin.subtitle).toBeUndefined();
  });

  it('sin gastos en la respuesta, Egresos vale 0 y Diferencia = ingresos', () => {
    const kpis = buildDashboardKpis({ ingresos: { total: 42, totalPagos: 2 } });
    expect(kpis[1].amount).toBe(0);
    expect(kpis[2].amount).toBe(42);
    expect(kpis[0].subtitle).toBe('2 pagos registrados');
  });
});
