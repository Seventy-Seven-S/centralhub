import { describe, it, expect } from 'vitest';
import { aplicarPagoACuotas, CuotaLike } from '../pagoCuotas';

const F = new Date('2026-07-08');
const c = (id: string, esperado: number, pagado = 0, status: 'PENDIENTE' | 'PAGADA' = 'PENDIENTE'): CuotaLike =>
  ({ id, montoEsperado: esperado, montoPagado: pagado, status });

describe('aplicarPagoACuotas', () => {
  it('monto exacto paga una cuota, leftover 0', () => {
    const { updates, leftover } = aplicarPagoACuotas(8000, F, [c('a', 8000), c('b', 8000)]);
    expect(updates).toEqual([{ id: 'a', montoPagado: 8000, fechaPago: F, status: 'PAGADA' }]);
    expect(leftover).toBe(0);
  });

  it('monto parcial deja la cuota PENDIENTE con acumulado, leftover 0', () => {
    const { updates, leftover } = aplicarPagoACuotas(3000, F, [c('a', 8000)]);
    expect(updates).toEqual([{ id: 'a', montoPagado: 3000, fechaPago: F, status: 'PENDIENTE' }]);
    expect(leftover).toBe(0);
  });

  it('completa una cuota ya parcial y sigue con la siguiente (adelanta cuota futura), leftover 0', () => {
    const { updates, leftover } = aplicarPagoACuotas(10000, F, [c('a', 8000, 6000), c('b', 8000)]);
    expect(updates).toEqual([
      { id: 'a', montoPagado: 8000, fechaPago: F, status: 'PAGADA' },
      { id: 'b', montoPagado: 8000, fechaPago: F, status: 'PAGADA' },
    ]);
    expect(leftover).toBe(0);
  });

  it('salta las PAGADA y empieza en la primera pendiente', () => {
    const { updates, leftover } = aplicarPagoACuotas(8000, F, [c('a', 8000, 8000, 'PAGADA'), c('b', 8000)]);
    expect(updates).toEqual([{ id: 'b', montoPagado: 8000, fechaPago: F, status: 'PAGADA' }]);
    expect(leftover).toBe(0);
  });

  it('monto que excede TODAS las cuotas combinadas → aplica hasta agotarlas y reporta el leftover (ya NO se descarta)', () => {
    const { updates, leftover } = aplicarPagoACuotas(50000, F, [c('a', 8000), c('b', 8000)]);
    expect(updates).toHaveLength(2);
    expect(updates.every(x => x.status === 'PAGADA')).toBe(true);
    expect(leftover).toBe(50000 - 16000);
  });

  it('monto que liquida exacto el total pendiente → leftover 0 (no falso positivo de sobrepago)', () => {
    const { leftover } = aplicarPagoACuotas(16000, F, [c('a', 8000), c('b', 8000)]);
    expect(leftover).toBe(0);
  });

  it('todas PAGADA → [] y todo el monto es leftover', () => {
    const { updates, leftover } = aplicarPagoACuotas(8000, F, [c('a', 8000, 8000, 'PAGADA')]);
    expect(updates).toEqual([]);
    expect(leftover).toBe(8000);
  });

  it('leftover se redondea a 2 decimales (round2)', () => {
    // 0.1 + 0.2 en floating point da 0.30000000000000004 — el leftover debe
    // salir limpio, no con ruido de coma flotante.
    const { leftover } = aplicarPagoACuotas(0.3, F, [c('a', 0.1), c('b', 0.1)]);
    expect(leftover).toBe(0.1);
  });
});
