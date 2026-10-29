import { describe, it, expect } from 'vitest';
import { pagoParaSocio } from '../payment.controller';

const pago = {
  id: 'p-1', paymentNumber: 'MON1-PAY-0001', paymentType: 'INSTALLMENT', paymentMethod: 'CASH',
  amount: 4200, paymentDate: new Date('2026-10-01T12:00:00Z'), concept: 'Mensualidad #3', status: 'CONFIRMED',
  notes: 'nota interna', referenceNumber: 'REF-9', createdBy: 'u-secretaria', clientId: 'c-1', contractId: 'k-1',
  balanceAfter: 100000, receiptUrl: 'https://…',
  contract: {
    id: 'k-1', contractNumber: 'MON1-F150', codigoLegado: 'F150', balance: 191249,
    client: { id: 'c-1', firstName: 'Ana', lastName: 'Pérez', phone: '444', email: 'a@x.mx' },
    lots: [{ lot: { manzana: 2, lotNumber: '7' } }],
  },
  corte: { id: 'co-1', numero: 3, fecha: new Date('2026-10-05T12:00:00Z') },
};

describe('pagoParaSocio', () => {
  it('deja solo lo que se lee en la tabla de ingresos', () => {
    expect(pagoParaSocio(pago as any)).toEqual({
      id: 'p-1', paymentNumber: 'MON1-PAY-0001', paymentType: 'INSTALLMENT', paymentMethod: 'CASH',
      amount: 4200, paymentDate: pago.paymentDate, concept: 'Mensualidad #3', status: 'CONFIRMED',
      contract: { id: null, codigoLegado: 'F150', client: { firstName: 'Ana', lastName: 'Pérez' }, lots: [{ lot: { manzana: 2, lotNumber: '7' } }] },
      corte: pago.corte,
    });
  });

  it('no deja pasar campos nuevos del cliente aunque el listado los traiga', () => {
    const r = pagoParaSocio(pago as any);
    expect(JSON.stringify(r)).not.toMatch(/444|a@x\.mx|nota interna|REF-9|u-secretaria|191249|c-1|k-1/);
  });

  it('un "otro ingreso" sin cliente no truena', () => {
    expect(pagoParaSocio({ ...pago, contract: { codigoLegado: null, client: null } } as any).contract)
      .toEqual({ id: null, codigoLegado: null, client: null, lots: [] });
  });
});
