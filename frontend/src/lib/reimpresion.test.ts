import { describe, it, expect } from 'vitest';
import { reciboPropsDesdeLog, reciboPropsDesdePago } from './reimpresion';

const LOG = {
  id: 'rec-1', paymentId: 'pay-1', folio: 'REC-V148-19de60', clienteNombre: 'Juan Pérez', codigoLegado: 'V148',
  proyecto: 'Valle del Roble', loteLabel: 'M3 L-12', numeroCuota: 19, mes: 'Agosto 2026', plazoTotal: 60,
  montoPagado: 3667, fechaPago: '2026-08-10T00:00:00.000Z', concepto: 'Pago mensual', balanceDespues: 196333.5,
};

describe('reciboPropsDesdeLog', () => {
  it('reconstruye cuota/pago/balance desde el snapshot para que el folio y el contenido salgan idénticos al original', () => {
    const p = reciboPropsDesdeLog(LOG);
    expect(p.cuota.numeroCuota).toBe(19);
    expect(p.cuota.mes).toBe('Agosto 2026');
    expect(p.pago).toEqual({ montoPagado: 3667, fechaPago: '2026-08-10T00:00:00.000Z', concepto: 'Pago mensual' });
    expect(p.balanceDespues).toBe(196333.5);
    expect(p.plazoTotal).toBe(60);
  });
});

describe('reciboPropsDesdePago (pago sin recibo emitido, p. ej. migrado)', () => {
  const pago = { id: 'pay-9', amount: 4000, paymentDate: '2026-07-01T00:00:00.000Z', concept: 'Mensualidad #14 — julio de 2026', balanceAfter: 150000 };
  it('toma el número de cuota del concepto y el balance del pago', () => {
    const p = reciboPropsDesdePago(pago, [{ numeroCuota: 14, mes: 'Julio 2026' }]);
    expect(p.cuota.numeroCuota).toBe(14);
    expect(p.cuota.mes).toBe('Julio 2026');
    expect(p.pago.montoPagado).toBe(4000);
    expect(p.balanceDespues).toBe(150000);
  });
  it('si el concepto no trae número de cuota, usa la primera cuota pagada en esa fecha o 0', () => {
    const p = reciboPropsDesdePago({ ...pago, concept: 'Abono' }, [{ numeroCuota: 3, mes: 'Marzo 2026', fechaPago: '2026-07-01T00:00:00.000Z' }]);
    expect(p.cuota.numeroCuota).toBe(3);
    const q = reciboPropsDesdePago({ ...pago, concept: 'Abono', balanceAfter: null }, []);
    expect(q.cuota.numeroCuota).toBe(0);
    expect(q.balanceDespues).toBe(0);
  });
});
