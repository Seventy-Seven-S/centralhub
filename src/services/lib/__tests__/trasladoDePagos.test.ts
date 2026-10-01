import { describe, it, expect } from 'vitest';
import { tipoAlTrasladar } from '../trasladoDePagos';

describe('tipoAlTrasladar', () => {
  it('un enganche deja de serlo al cambiar de contrato', () => {
    // Caso real V369 → V254: el enganche de $40,000 llegó como DOWN_PAYMENT y
    // el saldo de V254 subió $40,000, porque el enganche no cuenta ni contra
    // las cuotas ni contra el campo downPayment del contrato que lo recibe.
    expect(tipoAlTrasladar('DOWN_PAYMENT')).toBe('EXTRA_PAYMENT');
  });

  it('el depósito de apartado también pasa a abono', () => {
    expect(tipoAlTrasladar('RESERVATION_DEPOSIT')).toBe('EXTRA_PAYMENT');
  });

  it('una mensualidad viaja como mensualidad', () => {
    expect(tipoAlTrasladar('INSTALLMENT')).toBe('INSTALLMENT');
  });

  it('un abono viaja como abono', () => {
    expect(tipoAlTrasladar('EXTRA_PAYMENT')).toBe('EXTRA_PAYMENT');
  });
});
