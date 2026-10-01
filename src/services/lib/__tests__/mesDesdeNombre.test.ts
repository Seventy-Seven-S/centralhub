import { describe, it, expect } from 'vitest';
import { mesDesdeNombre } from '../mesDesdeNombre';

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('mesDesdeNombre', () => {
  it('elige el año de la ocurrencia MÁS CERCANA al ancla', () => {
    // V019: su primer pago fue en julio 2024 y el equipo dice JULIO.
    expect(mesDesdeNombre('JULIO', d('2024-07-01'))).toBe('2024-07');
  });

  it('puede caer ANTES del ancla cuando esa ocurrencia está más cerca', () => {
    // I013 de Magnolia: su primer pago fue el 9 de julio 2025 y cubría
    // "MAR,ABR,MAY,JUN". El equipo dice MARZO: es marzo de 2025, cuatro meses
    // antes, no marzo de 2026 ocho meses después.
    expect(mesDesdeNombre('MARZO', d('2025-07-09'))).toBe('2025-03');
  });

  it('cruza el fin de año hacia adelante', () => {
    // V141: primer pago el 6 de enero 2025, el equipo dice ENERO.
    expect(mesDesdeNombre('ENERO', d('2025-01-06'))).toBe('2025-01');
  });

  it('cruza el fin de año hacia atrás', () => {
    expect(mesDesdeNombre('DICIEMBRE', d('2025-01-20'))).toBe('2024-12');
  });

  it('el mismo mes del ancla se queda en ese año', () => {
    expect(mesDesdeNombre('MAYO', d('2024-05-21'))).toBe('2024-05');
  });

  it('tolera acentos, minúsculas y espacios', () => {
    expect(mesDesdeNombre(' septiembre ', d('2024-09-03'))).toBe('2024-09');
  });

  it('devuelve null cuando el texto no es un mes', () => {
    expect(mesDesdeNombre('', d('2024-05-21'))).toBeNull();
    expect(mesDesdeNombre('ALGO', d('2024-05-21'))).toBeNull();
  });
});
