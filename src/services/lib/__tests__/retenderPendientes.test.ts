import { describe, it, expect } from 'vitest';
import { retenderPendientes } from '../retenderPendientes';

const pagada = (n: number, monto: number) => ({
  numeroCuota: n, montoEsperado: monto, montoPagado: monto,
  status: 'PAGADA' as const, fechaVencimiento: new Date(2024, n - 1, 6),
});
const pendiente = (n: number, monto: number) => ({
  numeroCuota: n, montoEsperado: monto, montoPagado: 0,
  status: 'PENDIENTE' as const, fechaVencimiento: new Date(2024, n - 1, 6),
});

describe('retenderPendientes — solo se toca el futuro', () => {
  const cuotas = [pagada(1, 2604.17), pagada(2, 2604.17), pendiente(3, 2604.17), pendiente(4, 2604.17)];

  it('NO modifica las cuotas ya pagadas: su historia es lo que el cliente pagó', () => {
    const r = retenderPendientes(cuotas, 5208.34, 2605);
    expect(r.conservadas).toHaveLength(2);
    expect(r.conservadas.every(c => c.montoEsperado === 2604.17)).toBe(true);
  });

  it('las pendientes quedan con la mensualidad nueva', () => {
    const r = retenderPendientes(cuotas, 5208.34, 2605);
    expect(r.nuevas[0].montoEsperado).toBe(2605);
  });

  it('la suma de las nuevas cuadra EXACTO contra el balance', () => {
    for (const [bal, mens] of [[5208.34, 2605], [85000, 4688], [100, 33], [1234.56, 100]] as const) {
      const r = retenderPendientes(cuotas, bal, mens);
      const suma = r.nuevas.reduce((a, c) => a + c.montoEsperado, 0);
      expect(Math.round(suma * 100) / 100).toBe(Math.round(bal * 100) / 100);
    }
  });

  it('la numeración continúa desde la última pagada, sin huecos ni repetidos', () => {
    const r = retenderPendientes(cuotas, 5208.34, 2605);
    expect(r.nuevas.map(c => c.numeroCuota)).toEqual([3, 4]);
  });

  it('las fechas siguen el ritmo mensual del calendario existente', () => {
    const r = retenderPendientes(cuotas, 7815, 2605);
    expect(r.nuevas).toHaveLength(3);
    expect(r.nuevas[2].fechaVencimiento.getMonth()).toBe(4); // mayo: continúa tras abril
    expect(r.nuevas[2].fechaVencimiento.getDate()).toBe(6);
  });

  it('un balance en cero deja el contrato sin pendientes', () => {
    const r = retenderPendientes([pagada(1, 100)], 0, 50);
    expect(r.nuevas).toHaveLength(0);
  });

  it('si no hay ninguna pagada, se retiende todo desde la cuota 1', () => {
    const r = retenderPendientes([pendiente(1, 100), pendiente(2, 100)], 200, 100);
    expect(r.conservadas).toHaveLength(0);
    expect(r.nuevas.map(c => c.numeroCuota)).toEqual([1, 2]);
  });

  it('una cuota parcialmente pagada NO se da por pagada ni se pierde su abono', () => {
    const parcial = { numeroCuota: 3, montoEsperado: 2604.17, montoPagado: 1000, status: 'PENDIENTE' as const, fechaVencimiento: new Date(2024, 2, 6) };
    const r = retenderPendientes([pagada(1, 2604.17), pagada(2, 2604.17), parcial], 4208.34, 2605);
    // El abono parcial se conserva en la primera cuota nueva.
    expect(r.nuevas[0].montoPagado).toBe(1000);
  });
});
