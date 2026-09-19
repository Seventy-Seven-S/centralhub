import { describe, it, expect } from 'vitest';
import { recomponerCuotas, estadoDelContrato } from '../recomponerCuotas';

const cuotas = (n: number, monto: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`, numeroCuota: i + 1, montoEsperado: monto, montoPagado: 0,
    status: 'PENDIENTE' as const, fechaPago: null,
  }));

const f = (s: string) => new Date(`${s}T00:00:00Z`);

describe('recomponerCuotas', () => {
  it('reparte los pagos en orden sobre el calendario', () => {
    const r = recomponerCuotas(
      [{ amount: 1000, paymentDate: f('2026-01-10') }, { amount: 1500, paymentDate: f('2026-02-10') }],
      cuotas(4, 1000),
    );
    expect(r.cuotas.map(c => [c.montoPagado, c.status])).toEqual([
      [1000, 'PAGADA'], [1000, 'PAGADA'], [500, 'PENDIENTE'], [0, 'PENDIENTE'],
    ]);
    expect(r.totalPagado).toBe(2500);
  });

  it('degrada una cuota que ya estaba PAGADA cuando el pago desaparece', () => {
    const previas = cuotas(3, 1000).map((c, i) =>
      i === 0 ? { ...c, montoPagado: 1000, status: 'PAGADA' as const, fechaPago: f('2026-01-10') } : c);
    const r = recomponerCuotas([], previas);
    expect(r.cuotas.map(c => [c.montoPagado, c.status])).toEqual([
      [0, 'PENDIENTE'], [0, 'PENDIENTE'], [0, 'PENDIENTE'],
    ]);
    expect(r.totalPagado).toBe(0);
  });

  it('reporta el sobrante cuando el dinero excede todo el calendario', () => {
    const r = recomponerCuotas([{ amount: 5000, paymentDate: f('2026-01-10') }], cuotas(2, 1000));
    expect(r.totalPagado).toBe(2000);
    expect(r.sobrante).toBe(3000);
  });

  it('lista solo las cuotas que de verdad cambian', () => {
    const previas = cuotas(3, 1000).map((c, i) =>
      i === 0 ? { ...c, montoPagado: 1000, status: 'PAGADA' as const, fechaPago: f('2026-01-10') } : c);
    const r = recomponerCuotas([{ amount: 1000, paymentDate: f('2026-01-10') }], previas);
    expect(r.cambios).toEqual([]);
  });
});

describe('estadoDelContrato', () => {
  const hoy = f('2026-09-19');
  const cuota = (n: number, status: 'PENDIENTE' | 'PAGADA', vence: string) => ({
    id: `c${n}`, numeroCuota: n, montoEsperado: 1000, montoPagado: status === 'PAGADA' ? 1000 : 0,
    status, fechaPago: null, fechaVencimiento: f(vence),
  });

  it('marca mora contando solo las cuotas vencidas sin pagar', () => {
    const r = estadoDelContrato(5000, [
      cuota(1, 'PAGADA', '2026-06-01'), cuota(2, 'PENDIENTE', '2026-07-01'),
      cuota(3, 'PENDIENTE', '2026-08-01'), cuota(4, 'PENDIENTE', '2026-12-01'),
    ], hoy);
    expect(r).toEqual({ status: 'IN_MORA', moraMonthsCount: 2 });
  });

  it('vuelve a ACTIVE cuando ya no hay vencidas pendientes', () => {
    const r = estadoDelContrato(3000, [
      cuota(1, 'PAGADA', '2026-06-01'), cuota(2, 'PENDIENTE', '2026-12-01'),
    ], hoy);
    expect(r).toEqual({ status: 'ACTIVE', moraMonthsCount: 0 });
  });

  it('liquida solo si el balance quedó en cero y no falta ninguna cuota', () => {
    const cuotas = [cuota(1, 'PAGADA', '2026-06-01'), cuota(2, 'PAGADA', '2026-07-01')];
    expect(estadoDelContrato(0, cuotas, hoy)).toEqual({ status: 'COMPLETED', moraMonthsCount: 0 });
    expect(estadoDelContrato(500, cuotas, hoy)).toEqual({ status: 'ACTIVE', moraMonthsCount: 0 });
  });
});
