import { describe, it, expect } from 'vitest';
import { mesSiguienteA, fechaInicioDesdeMes } from './mesPrimeraMensualidad';

describe('mesSiguienteA', () => {
  it('propone el mes siguiente, que es donde cae la cuota 1 por omisión', () => {
    expect(mesSiguienteA('2026-09-24')).toBe('2026-10');
  });
  it('cruza el fin de año', () => {
    expect(mesSiguienteA('2026-12-15')).toBe('2027-01');
  });
});

describe('fechaInicioDesdeMes', () => {
  it('ancla un mes antes, porque la cuota 1 vence un mes después del inicio', () => {
    // Contrato del 24 de septiembre, primera mensualidad en octubre:
    // el ancla es el 24 de septiembre.
    expect(fechaInicioDesdeMes('2026-10', '2026-09-24')).toBe('2026-09-24');
  });

  it('para arrancar en noviembre, el ancla se recorre un mes', () => {
    // Es el caso de después del día 20: se le da al cliente un mes más.
    expect(fechaInicioDesdeMes('2026-11', '2026-09-24')).toBe('2026-10-24');
  });

  it('conserva el día del contrato, que es el día de pago del cliente', () => {
    expect(fechaInicioDesdeMes('2026-12', '2026-09-03')).toBe('2026-11-03');
  });

  it('recorta el día cuando el mes destino no lo tiene', () => {
    // 31 de enero + un mes no es 31 de febrero.
    expect(fechaInicioDesdeMes('2026-03', '2026-01-31')).toBe('2026-02-28');
  });

  it('sin mes capturado, deja la fecha del contrato', () => {
    expect(fechaInicioDesdeMes('', '2026-09-24')).toBe('2026-09-24');
  });
});
