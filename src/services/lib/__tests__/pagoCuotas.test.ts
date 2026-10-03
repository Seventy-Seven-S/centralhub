import { describe, it, expect } from 'vitest';
import { aplicarPagoACuotas, CuotaLike } from '../pagoCuotas';

const F = new Date('2026-07-08');
const c = (id: string, esperado: number, pagado = 0, status: 'PENDIENTE' | 'PAGADA' = 'PENDIENTE'): CuotaLike =>
  ({ id, montoEsperado: esperado, montoPagado: pagado, status });

describe('aplicarPagoACuotas', () => {
  it('un solo pago que liquida 72 cuotas con centavos deja la ÚLTIMA como PAGADA (sin víctimas de punto flotante)', () => {
    // Caso real V329: 71 cuotas de 2222.22 + última de 2222.38 = 160000 exacto.
    const cuotas = [...Array(71)].map((_, i) => c(`c${i + 1}`, 2222.22)).concat(c('c72', 2222.38));
    const { updates, leftover } = aplicarPagoACuotas(160000, F, cuotas);
    expect(updates).toHaveLength(72);
    expect(updates[71]).toEqual({ id: 'c72', montoPagado: 2222.38, fechaPago: F, status: 'PAGADA' });
    expect(leftover).toBe(0);
  });

  it('acumulado parcial + resto con centavos (0.1 + 0.2 sobre 0.3) cierra la cuota como PAGADA', () => {
    const { updates } = aplicarPagoACuotas(0.2, F, [c('a', 0.3, 0.1)]);
    expect(updates).toEqual([{ id: 'a', montoPagado: 0.3, fechaPago: F, status: 'PAGADA' }]);
  });

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

describe('un monto NEGATIVO retira crédito del calendario', () => {
  // Pasa cuando el cliente traspasa un lote y se lleva su dinero, o cuando se
  // le devuelve algo: el movimiento se registra en negativo. Antes no hacía
  // nada — el bucle solo avanzaba mientras quedara dinero positivo — así que
  // el calendario seguía mostrando cuotas pagadas con dinero que ya se fue.
  // Caso real: V356 traspasó el lote 22 con $26,000 y su saldo quedó $26,000
  // por debajo de lo que debía.
  const calendario = () => [
    { id: 'c1', montoEsperado: 4000, montoPagado: 4000, status: 'PAGADA' as const },
    { id: 'c2', montoEsperado: 4000, montoPagado: 4000, status: 'PAGADA' as const },
    { id: 'c3', montoEsperado: 4000, montoPagado: 2000, status: 'PENDIENTE' as const },
  ];
  const cuando = new Date('2026-01-15T12:00:00Z');

  it('despaga desde la última cuota hacia atrás', () => {
    const { updates } = aplicarPagoACuotas(-6000, cuando, calendario());
    const porId = new Map(updates.map(u => [u.id, u]));
    expect(porId.get('c3')!.montoPagado).toBe(0);
    expect(porId.get('c2')!.montoPagado).toBe(0);
    expect(porId.get('c2')!.status).toBe('PENDIENTE');
    expect(porId.has('c1')).toBe(false);          // la primera no se toca
  });

  it('deja una cuota a medias cuando el retiro no la cubre entera', () => {
    const { updates } = aplicarPagoACuotas(-1000, cuando, calendario());
    const c3 = updates.find(u => u.id === 'c3')!;
    expect(c3.montoPagado).toBe(1000);
    expect(c3.status).toBe('PENDIENTE');
  });

  it('no deja crédito negativo si se retira de más', () => {
    const { updates, leftover } = aplicarPagoACuotas(-50000, cuando, calendario());
    updates.forEach(u => expect(u.montoPagado).toBeGreaterThanOrEqual(0));
    // Lo que no alcanzó a retirarse se reporta, no se pierde en silencio.
    expect(leftover).toBeLessThan(0);
  });

  it('un calendario sin nada pagado no puede dar crédito', () => {
    const vacio = [{ id: 'c1', montoEsperado: 4000, montoPagado: 0, status: 'PENDIENTE' as const }];
    const { updates, leftover } = aplicarPagoACuotas(-4000, cuando, vacio);
    expect(updates).toEqual([]);
    expect(leftover).toBe(-4000);
  });
});
