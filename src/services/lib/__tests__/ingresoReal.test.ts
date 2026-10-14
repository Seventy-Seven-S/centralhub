import { describe, it, expect } from 'vitest';
import { TIPOS_QUE_NO_SON_INGRESO, DEVOLUCION_CON_GASTO, whereIngresoReal, esIngresoReal } from '../ingresoReal';

describe('TIPOS_QUE_NO_SON_INGRESO', () => {
  it('excluye el abono que viaja en un traspaso', () => {
    // El dinero ya se contó cuando el cliente pagó en el contrato de origen.
    // Contarlo otra vez en el destino duplicaría los ingresos del proyecto.
    expect(TIPOS_QUE_NO_SON_INGRESO).toContain('TRASPASO_ENTRADA');
  });

  it('NO excluye lo que sí es dinero que entró', () => {
    for (const t of ['INSTALLMENT', 'DOWN_PAYMENT', 'EXTRA_PAYMENT']) {
      expect(TIPOS_QUE_NO_SON_INGRESO).not.toContain(t);
    }
  });

  it('deja pasar la devolución por rescisión, que es dinero que salió', () => {
    // Se guarda en negativo, así que sumarla resta. Excluirla inflaría los
    // ingresos con dinero que ya se le regresó al cliente.
    expect(TIPOS_QUE_NO_SON_INGRESO).not.toContain('RESCISSION_REFUND');
  });
});

describe('whereIngresoReal', () => {
  it('arma el filtro que deben usar todas las sumas de ingresos', () => {
    expect(whereIngresoReal()).toEqual({ paymentType: { notIn: TIPOS_QUE_NO_SON_INGRESO }, NOT: DEVOLUCION_CON_GASTO });
  });

  it('saca la devolución que ya tiene su gasto, para no restarla dos veces', () => {
    expect(DEVOLUCION_CON_GASTO).toEqual({ paymentType: 'RESCISSION_REFUND', gastoDevolucion: { isNot: null } });
  });
});

describe('esIngresoReal', () => {
  it('sirve para filtrar en memoria lo mismo que el filtro de base', () => {
    expect(esIngresoReal({ paymentType: 'INSTALLMENT' })).toBe(true);
    expect(esIngresoReal({ paymentType: 'TRASPASO_ENTRADA' })).toBe(false);
    expect(esIngresoReal({ paymentType: 'RESCISSION_REFUND', gastoDevolucion: { id: 'g' } })).toBe(false);
    // La migrada, sin gasto, sigue restando como ingreso negativo.
    expect(esIngresoReal({ paymentType: 'RESCISSION_REFUND', gastoDevolucion: null })).toBe(true);
  });
});
