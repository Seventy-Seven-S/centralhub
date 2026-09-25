import { describe, it, expect } from 'vitest';
import { wherePendienteDeCorte } from '../cortePendiente';

describe('wherePendienteDeCorte', () => {
  it('son los pagos confirmados del proyecto que no están en ningún corte', () => {
    expect(wherePendienteDeCorte('proy-1')).toMatchObject({
      status: 'CONFIRMED',
      corteId: null,
      contract: { projectId: 'proy-1' },
    });
  });

  it('deja fuera el abono que viaja en un traspaso', () => {
    // Ese dinero ya se le entregó al dueño cuando el cliente lo pagó; volver a
    // meterlo en un corte lo entregaría dos veces.
    expect(wherePendienteDeCorte('proy-1').paymentType)
      .toEqual({ notIn: ['TRASPASO_ENTRADA'] });
  });

  it('un pago cancelado o pendiente no cuenta como por entregar', () => {
    // El dinero que todavía no se confirma no se le debe al dueño.
    expect(wherePendienteDeCorte('p').status).toBe('CONFIRMED');
  });

  it('un pago ya reportado en un corte queda fuera', () => {
    expect(wherePendienteDeCorte('p').corteId).toBeNull();
  });
});
