import { describe, it, expect } from 'vitest';
import { resumenPagado } from './resumenPagado';

const pago = (amount: number, status = 'CONFIRMED') => ({ amount, status });

describe('resumenPagado', () => {
  it('suma los pagos reales, no deduce de lo que falta', () => {
    const r = resumenPagado({ totalPrice: 235000, balance: 176480, status: 'ACTIVE' },
      [pago(15000), pago(43520)]);
    expect(r.pagado).toBe(58520);
    expect(r.pct).toBe(25);
  });

  it('un contrato rescindido no aparece pagado al 100%', () => {
    // La rescisión pone el balance en cero porque ya no se debe nada, y la
    // pantalla deducía "pagado = precio - balance" = todo el terreno.
    // V037 pagó $58,520 de $235,000, no $235,000.
    const r = resumenPagado({ totalPrice: 235000, balance: 0, status: 'RESCISSION' },
      [pago(58520)]);
    expect(r.pagado).toBe(58520);
    expect(r.pct).toBe(25);
    expect(r.contratoTerminado).toBe(true);
  });

  it('no cuenta los pagos que no están confirmados', () => {
    const r = resumenPagado({ totalPrice: 100000, balance: 0, status: 'ACTIVE' },
      [pago(10000), pago(5000, 'PENDING'), pago(5000, 'CANCELED')]);
    expect(r.pagado).toBe(10000);
  });

  it('un contrato liquidado de verdad sí llega al 100%', () => {
    const r = resumenPagado({ totalPrice: 50000, balance: 0, status: 'COMPLETED' },
      [pago(50000)]);
    expect(r.pct).toBe(100);
    expect(r.contratoTerminado).toBe(true);
  });

  it('nunca pasa del 100% aunque el cliente haya pagado de más', () => {
    const r = resumenPagado({ totalPrice: 50000, balance: 0, status: 'ACTIVE' }, [pago(60000)]);
    expect(r.pct).toBe(100);
    expect(r.pagado).toBe(60000);
  });

  it('un contrato sin precio no divide entre cero', () => {
    const r = resumenPagado({ totalPrice: 0, balance: 0, status: 'DRAFT' }, []);
    expect(r.pct).toBe(0);
    expect(r.pagado).toBe(0);
  });
});
