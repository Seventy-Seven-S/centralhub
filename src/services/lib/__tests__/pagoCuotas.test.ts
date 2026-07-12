import { describe, it, expect } from 'vitest';
import { aplicarPagoACuotas, CuotaLike } from '../pagoCuotas';

const F = new Date('2026-07-08');
const c = (id: string, esperado: number, pagado = 0, status: 'PENDIENTE' | 'PAGADA' = 'PENDIENTE'): CuotaLike =>
  ({ id, montoEsperado: esperado, montoPagado: pagado, status });

describe('aplicarPagoACuotas', () => {
  it('monto exacto paga una cuota', () => {
    const u = aplicarPagoACuotas(8000, F, [c('a', 8000), c('b', 8000)]);
    expect(u).toEqual([{ id: 'a', montoPagado: 8000, fechaPago: F, status: 'PAGADA' }]);
  });

  it('monto parcial deja la cuota PENDIENTE con acumulado', () => {
    const u = aplicarPagoACuotas(3000, F, [c('a', 8000)]);
    expect(u).toEqual([{ id: 'a', montoPagado: 3000, fechaPago: F, status: 'PENDIENTE' }]);
  });

  it('completa una cuota ya parcial y sigue con la siguiente', () => {
    const u = aplicarPagoACuotas(10000, F, [c('a', 8000, 6000), c('b', 8000)]);
    expect(u).toEqual([
      { id: 'a', montoPagado: 8000, fechaPago: F, status: 'PAGADA' },
      { id: 'b', montoPagado: 8000, fechaPago: F, status: 'PAGADA' },
    ]);
  });

  it('salta las PAGADA y empieza en la primera pendiente', () => {
    const u = aplicarPagoACuotas(8000, F, [c('a', 8000, 8000, 'PAGADA'), c('b', 8000)]);
    expect(u).toEqual([{ id: 'b', montoPagado: 8000, fechaPago: F, status: 'PAGADA' }]);
  });

  it('monto que excede todas las cuotas aplica hasta agotarlas', () => {
    const u = aplicarPagoACuotas(50000, F, [c('a', 8000), c('b', 8000)]);
    expect(u).toHaveLength(2);
    expect(u.every(x => x.status === 'PAGADA')).toBe(true);
  });

  it('todas PAGADA → []', () => {
    expect(aplicarPagoACuotas(8000, F, [c('a', 8000, 8000, 'PAGADA')])).toEqual([]);
  });
});
