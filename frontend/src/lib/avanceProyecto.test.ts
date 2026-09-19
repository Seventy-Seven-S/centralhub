import { describe, it, expect } from 'vitest';
import { avanceDeVentas } from './avanceProyecto';

describe('avanceDeVentas', () => {
  it('mide contra el total real, no contra vendidos más disponibles', () => {
    // JSA 2: 140 vendidos, 24 no disponibles, 0 libres. Antes se veía 100%.
    const r = avanceDeVentas({ totalLotes: 164, lotesVendidos: 140, lotesDisponibles: 0, lotesReservados: 0, lotesNoDisponibles: 24 });
    expect(r.pct).toBe(85);
    expect(r.detalle).toBe('140 de 164 lotes');
  });

  it('nombra los lotes que no están ni vendidos ni libres', () => {
    const r = avanceDeVentas({ totalLotes: 224, lotesVendidos: 217, lotesDisponibles: 1, lotesReservados: 3, lotesNoDisponibles: 3 });
    expect(r.aparte).toBe('3 reservados · 3 no disponibles');
  });

  it('no dice nada aparte cuando todos los lotes están vendidos o libres', () => {
    const r = avanceDeVentas({ totalLotes: 113, lotesVendidos: 100, lotesDisponibles: 13, lotesReservados: 0, lotesNoDisponibles: 0 });
    expect(r.aparte).toBeNull();
    expect(r.pct).toBe(88);
  });

  it('un proyecto sin lotes cargados no divide entre cero', () => {
    const r = avanceDeVentas({ totalLotes: 0, lotesVendidos: 0, lotesDisponibles: 0, lotesReservados: 0, lotesNoDisponibles: 0 });
    expect(r.pct).toBe(0);
    expect(r.detalle).toBe('sin lotes cargados');
  });
});
