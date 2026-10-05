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
    // Desde el 2026-10-05 también quedan fuera las devoluciones: ese dinero ya
    // se amortizó con el dueño cuando se regresó al cliente.
    const w = wherePendienteDeCorte('proj-1') as any;
    expect(w.paymentType.notIn).toContain('TRASPASO_ENTRADA');
  });

  it('un pago cancelado o pendiente no cuenta como por entregar', () => {
    // El dinero que todavía no se confirma no se le debe al dueño.
    expect(wherePendienteDeCorte('p').status).toBe('CONFIRMED');
  });

  it('un pago ya reportado en un corte queda fuera', () => {
    expect(wherePendienteDeCorte('p').corteId).toBeNull();
  });
});

describe('las devoluciones no entran a los cortes', () => {
  it('una devolución por cancelación queda fuera de lo pendiente', () => {
    // Decisión del equipo (2026-10-05): el dinero devuelto ya se amortizó con
    // el dueño en su momento, así que no debe volver a descontarse en un
    // corte. Salió al registrar las 31 devoluciones de la revisión de
    // septiembre: $309,264 que iban a aparecer como pendientes en siete
    // proyectos, por devoluciones hechas entre 2025 y 2026.
    const w = wherePendienteDeCorte('p1') as any;
    expect(w.paymentType.notIn).toContain('RESCISSION_REFUND');
  });

  it('sigue dejando fuera la entrada de un traspaso', () => {
    const w = wherePendienteDeCorte('p1') as any;
    expect(w.paymentType.notIn).toContain('TRASPASO_ENTRADA');
  });

  it('una mensualidad normal sí entra', () => {
    const w = wherePendienteDeCorte('p1') as any;
    expect(w.paymentType.notIn).not.toContain('INSTALLMENT');
  });
});
