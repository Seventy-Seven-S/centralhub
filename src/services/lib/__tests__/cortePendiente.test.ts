import { describe, it, expect } from 'vitest';
import { wherePendienteDeCorte } from '../cortePendiente';

describe('wherePendienteDeCorte', () => {
  it('son los pagos confirmados del proyecto que no están en ningún corte', () => {
    expect(wherePendienteDeCorte('proy-1')).toEqual({
      status: 'CONFIRMED',
      corteId: null,
      contract: { projectId: 'proy-1' },
    });
  });

  it('un pago cancelado o pendiente no cuenta como por entregar', () => {
    // El dinero que todavía no se confirma no se le debe al dueño.
    expect(wherePendienteDeCorte('p').status).toBe('CONFIRMED');
  });

  it('un pago ya reportado en un corte queda fuera', () => {
    expect(wherePendienteDeCorte('p').corteId).toBeNull();
  });
});
