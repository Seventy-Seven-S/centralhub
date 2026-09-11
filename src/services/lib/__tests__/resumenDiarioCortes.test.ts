import { describe, it, expect } from 'vitest';
import { construirResumenDiario, CorteDelDia } from '../resumenDiarioCortes';

const corte = (o: Partial<CorteDelDia> = {}): CorteDelDia => ({
  numero: 1, cobradorId: 'u1', cobrador: 'Maria Cordova',
  totalEfectivo: 34328, totalOtros: 0, declarado: 34328,
  recibido: 34328, diferencia: 0, status: 'RECIBIDO', pagos: 7, ...o,
});

describe('resumen diario — el total de todas, al cerrar el día', () => {
  it('suma lo declarado y lo recibido de todos los cortes', () => {
    const r = construirResumenDiario('2026-09-09', [
      corte({ cobradorId: 'u1', declarado: 34328, recibido: 34328 }),
      corte({ cobradorId: 'u2', declarado: 29326, recibido: 29326 }),
      corte({ cobradorId: 'u3', declarado: 38335, recibido: 38335 }),
    ], ['u1', 'u2', 'u3']);
    expect(r.totalDeclarado).toBe(101989);
    expect(r.totalRecibido).toBe(101989);
  });

  it('avisa cuántas FALTAN por cerrar: un total parcial leído como final engaña', () => {
    // Tres personas cobraron hoy, solo dos cerraron.
    const r = construirResumenDiario('2026-09-10', [
      corte({ cobradorId: 'u1' }), corte({ cobradorId: 'u2' }),
    ], ['u1', 'u2', 'u3']);
    expect(r.cerrados).toBe(2);
    expect(r.faltanPorCerrar).toBe(1);
    expect(r.completo).toBe(false);
  });

  it('el día está completo cuando todas las que cobraron ya cerraron', () => {
    const r = construirResumenDiario('2026-09-09', [
      corte({ cobradorId: 'u1' }), corte({ cobradorId: 'u2' }),
    ], ['u1', 'u2']);
    expect(r.completo).toBe(true);
    expect(r.faltanPorCerrar).toBe(0);
  });

  it('separa lo ya recibido de lo que sigue pendiente de entrega', () => {
    const r = construirResumenDiario('2026-09-10', [
      corte({ cobradorId: 'u1', declarado: 10000, recibido: 10000, status: 'RECIBIDO' }),
      corte({ cobradorId: 'u2', declarado: 20000, recibido: null, status: 'PENDIENTE_ENTREGA' }),
    ], ['u1', 'u2']);
    expect(r.totalDeclarado).toBe(30000);
    expect(r.totalRecibido).toBe(10000);
    expect(r.pendientesDeEntrega).toBe(1);
  });

  it('acumula las diferencias y dice cuántos cortes tuvieron una', () => {
    const r = construirResumenDiario('2026-09-10', [
      corte({ cobradorId: 'u1', declarado: 10000, recibido: 9700, diferencia: -300 }),
      corte({ cobradorId: 'u2', declarado: 20000, recibido: 20000, diferencia: 0 }),
    ], ['u1', 'u2']);
    expect(r.totalDiferencia).toBe(-300);
    expect(r.cortesConDiferencia).toBe(1);
  });

  it('un día sin cortes da ceros y no truena', () => {
    const r = construirResumenDiario('2026-09-12', [], []);
    expect(r).toMatchObject({ cerrados: 0, faltanPorCerrar: 0, totalDeclarado: 0, cortes: [] });
  });

  it('si nadie cobró, el día NO se marca completo: no hay nada que cerrar', () => {
    // Un domingo sin actividad no es "el día cerró bien", es un día sin trabajo.
    expect(construirResumenDiario('2026-09-13', [], []).completo).toBe(false);
  });

  it('el no-efectivo se reporta aparte y no se mezcla con la entrega', () => {
    const r = construirResumenDiario('2026-09-10', [
      corte({ cobradorId: 'u1', totalEfectivo: 10000, totalOtros: 5000, declarado: 10000 }),
    ], ['u1']);
    expect(r.totalEfectivo).toBe(10000);
    expect(r.totalOtros).toBe(5000);
    expect(r.totalDeclarado).toBe(10000);
  });

  it('los cortes salen ordenados por número', () => {
    const r = construirResumenDiario('2026-09-10', [
      corte({ numero: 6, cobradorId: 'u3' }), corte({ numero: 4, cobradorId: 'u1' }),
    ], ['u1', 'u3']);
    expect(r.cortes.map(c => c.numero)).toEqual([4, 6]);
  });
});
