import { describe, it, expect } from 'vitest';
import { desglosarPagado, Pago } from './desglosePagado';

const pago = (amount: number, paymentType: string, status = 'CONFIRMED'): Pago =>
  ({ amount, paymentType, status } as Pago);

describe('desglosarPagado', () => {
  it('separa el enganche de las mensualidades', () => {
    // El equipo pidió ver esa división: el cliente pregunta cuánto dio de
    // enganche y el estado de cuenta solo mostraba el total.
    const r = desglosarPagado([
      pago(30000, 'DOWN_PAYMENT'),
      pago(4000, 'INSTALLMENT'),
      pago(4000, 'INSTALLMENT'),
    ]);
    expect(r).toEqual({ enganche: 30000, mensualidades: 8000, total: 38000 });
  });

  it('el depósito de apartado cuenta como enganche', () => {
    // Para el cliente es el dinero que entregó por adelantado, no una cuota.
    const r = desglosarPagado([pago(5000, 'RESERVATION_DEPOSIT'), pago(25000, 'DOWN_PAYMENT')]);
    expect(r.enganche).toBe(30000);
    expect(r.mensualidades).toBe(0);
  });

  it('los abonos extra cuentan como mensualidades', () => {
    expect(desglosarPagado([pago(9000, 'EXTRA_PAYMENT')]).mensualidades).toBe(9000);
  });

  it('ignora lo que no está confirmado', () => {
    const r = desglosarPagado([pago(30000, 'DOWN_PAYMENT'), pago(4000, 'INSTALLMENT', 'PENDING')]);
    expect(r).toEqual({ enganche: 30000, mensualidades: 0, total: 30000 });
  });

  it('una devolución resta del total', () => {
    const r = desglosarPagado([pago(30000, 'DOWN_PAYMENT'), pago(-5000, 'RESCISSION_REFUND')]);
    expect(r.total).toBe(25000);
  });

  it('sin pagos da ceros, no NaN', () => {
    expect(desglosarPagado([])).toEqual({ enganche: 0, mensualidades: 0, total: 0 });
  });
});
