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
    const p = reciboPropsDesdePago(pago, [{ numeroCuota: 14, mes: 'Julio 2026' }], { totalPrice: 200000 }, [pago]);
    expect(p.cuota.numeroCuota).toBe(14);
    expect(p.cuota.mes).toBe('Julio 2026');
    expect(p.pago.montoPagado).toBe(4000);
    expect(p.balanceDespues).toBe(150000);
  });
  it('si el concepto no trae número de cuota, usa la primera cuota pagada en esa fecha o 0', () => {
    const p = reciboPropsDesdePago({ ...pago, concept: 'Abono' }, [{ numeroCuota: 3, mes: 'Marzo 2026', fechaPago: '2026-07-01T00:00:00.000Z' }], { totalPrice: 200000 }, [pago]);
    expect(p.cuota.numeroCuota).toBe(3);
    // Sin balanceAfter el saldo se deriva: $200,000 de precio menos los
    // $4,000 de este pago.
    const sinSaldo = { ...pago, concept: 'Abono', balanceAfter: null };
    const q = reciboPropsDesdePago(sinSaldo, [], { totalPrice: 200000 }, [sinSaldo]);
    expect(q.cuota.numeroCuota).toBe(0);
    expect(q.balanceDespues).toBe(196000);
  });
});

describe('reciboPropsDesdePago — saldo de pagos migrados', () => {
  const cuotas = [{ numeroCuota: 18, mes: 'abril de 2026', fechaPago: '2026-08-13' }];
  const contrato = { totalPrice: 235000 };

  it('usa el saldo guardado cuando el pago lo trae', () => {
    const pago = { id: 'p2', amount: 5000, paymentDate: '2026-05-01', concept: 'Mensualidad #10', balanceAfter: 123456 };
    const r = reciboPropsDesdePago(pago, cuotas, contrato, [pago]);
    expect(r.balanceDespues).toBe(123456);
  });

  it('lo calcula cuando el pago viene sin saldo, en vez de mostrar cero', () => {
    // Guillermo: $235,000 de precio. Antes de este pago llevaba $77,459.
    const previos = [
      { id: 'a', amount: 77459, paymentDate: '2026-01-10', concept: '', balanceAfter: null },
      { id: 'b', amount: 11001, paymentDate: '2026-08-13', concept: 'Cuota #18', balanceAfter: null },
    ];
    const r = reciboPropsDesdePago(previos[1], cuotas, contrato, previos);
    expect(r.balanceDespues).toBe(146540);
  });

  it('no cuenta los pagos posteriores al que se está imprimiendo', () => {
    const pagos = [
      { id: 'a', amount: 10000, paymentDate: '2026-01-10', concept: '', balanceAfter: null },
      { id: 'b', amount: 10000, paymentDate: '2026-02-10', concept: '', balanceAfter: null },
      { id: 'c', amount: 10000, paymentDate: '2026-03-10', concept: '', balanceAfter: null },
    ];
    expect(reciboPropsDesdePago(pagos[1], cuotas, { totalPrice: 100000 }, pagos).balanceDespues).toBe(80000);
  });

  it('nunca devuelve un saldo negativo', () => {
    const pagos = [{ id: 'a', amount: 150000, paymentDate: '2026-01-10', concept: '', balanceAfter: null }];
    expect(reciboPropsDesdePago(pagos[0], cuotas, { totalPrice: 100000 }, pagos).balanceDespues).toBe(0);
  });
});
