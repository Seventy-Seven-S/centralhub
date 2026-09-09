import { describe, it, expect } from 'vitest';
import { construirDashboardOperativo } from '../lib/dashboardOperativo';

const BASE = {
  misCobrosHoy: { total: 33500, count: 9 },
  cuotasVencidas: 128,
  cuotasVencenEstaSemana: 14,
  apartadosPorVencer: 3,
  contratosActivos: 420,
  lotesDisponibles: 289,
};

describe('dashboard operativo — lo que SÍ puede ver una secretaria', () => {
  it('incluye sus propios cobros del día', () => {
    const d = construirDashboardOperativo(BASE);
    expect(d.misCobrosHoy).toEqual({ total: 33500, count: 9 });
  });

  it('NO expone ningún total del negocio: ni ingresos, ni egresos, ni diferencia', () => {
    const d = construirDashboardOperativo(BASE);
    const claves = JSON.stringify(d).toLowerCase();
    expect(claves).not.toContain('ingresostotal');
    expect(claves).not.toContain('egresos');
    expect(claves).not.toContain('diferencia');
    expect(claves).not.toContain('ingresospormes');
    expect(d).not.toHaveProperty('ingresos');
    expect(d).not.toHaveProperty('gastos');
  });

  it('los indicadores de trabajo son conteos, no montos', () => {
    const d = construirDashboardOperativo(BASE);
    expect(d.porCobrar.vencidas).toBe(128);
    expect(d.porCobrar.vencenEstaSemana).toBe(14);
    expect(d.apartadosPorVencer).toBe(3);
    expect(d.inventario).toEqual({ contratosActivos: 420, lotesDisponibles: 289 });
  });

  it('un día sin cobros muestra cero, no se rompe', () => {
    const d = construirDashboardOperativo({ ...BASE, misCobrosHoy: { total: 0, count: 0 } });
    expect(d.misCobrosHoy).toEqual({ total: 0, count: 0 });
  });

  it('el único monto presente es el de sus propios cobros', () => {
    const d = construirDashboardOperativo(BASE);
    const montos = JSON.stringify(d).match(/33500|\d{5,}/g) ?? [];
    expect(montos).toEqual(['33500']);
  });
});
