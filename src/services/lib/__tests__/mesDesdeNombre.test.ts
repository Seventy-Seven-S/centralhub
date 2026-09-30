import { describe, it, expect } from 'vitest';
import { mesDesdeNombre } from '../mesDesdeNombre';

const contrato = (iso: string) => new Date(`${iso}T12:00:00`);

describe('mesDesdeNombre', () => {
  it('toma el año del contrato cuando el mes viene después', () => {
    // V019: firmó en mayo 2024, su primera mensualidad es JULIO 2024.
    expect(mesDesdeNombre('JULIO', contrato('2024-05-21'))).toBe('2024-07');
  });

  it('pasa al año siguiente cuando el mes ya quedó atrás', () => {
    // V141: firmó en noviembre 2024, su primera mensualidad es ENERO 2025.
    expect(mesDesdeNombre('ENERO', contrato('2024-11-21'))).toBe('2025-01');
  });

  it('el mismo mes del contrato se queda en ese año', () => {
    expect(mesDesdeNombre('MAYO', contrato('2024-05-21'))).toBe('2024-05');
  });

  it('tolera acentos, minúsculas y espacios', () => {
    expect(mesDesdeNombre(' septiembre ', contrato('2024-07-30'))).toBe('2024-09');
    expect(mesDesdeNombre('Diciembre', contrato('2024-11-01'))).toBe('2024-12');
  });

  it('devuelve null cuando el texto no es un mes', () => {
    expect(mesDesdeNombre('', contrato('2024-05-21'))).toBeNull();
    expect(mesDesdeNombre('ALGO', contrato('2024-05-21'))).toBeNull();
  });
});
