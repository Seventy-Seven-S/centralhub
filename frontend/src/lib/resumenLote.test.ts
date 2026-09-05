import { describe, it, expect } from 'vitest';
import { resumenLote } from './resumenLote';

const base = { id: 'l1', status: 'SOLD', currentPrice: 230000, areaM2: 256.16 } as any;

describe('resumenLote', () => {
  it('lote vendido: cliente, código, link al contrato, precio de venta y estado del contrato', () => {
    const r = resumenLote({
      ...base,
      contracts: [{ priceAtSale: 244000, contract: { id: 'c-9', contractNumber: 'JSA2-A013', codigoLegado: 'A013', status: 'IN_MORA', balance: 33797, client: { id: 'cl-1', firstName: 'Karina', lastName: 'Rodriguez Acuña' } } }],
    });
    expect(r).toEqual({ tipo: 'vendido', cliente: 'Karina Rodriguez Acuña', codigo: 'A013', contratoId: 'c-9', precioVenta: 244000, estadoContrato: 'IN_MORA', balance: 33797 });
  });

  it('lote no disponible (sin contrato vigente): propietario Antonio Isassi, no está a la venta', () => {
    const r = resumenLote({ ...base, status: 'UNAVAILABLE', contracts: [] });
    expect(r).toEqual({ tipo: 'propietario', propietario: 'Antonio Isassi' });
  });

  it('lote disponible o reservado sin contrato: tipo libre', () => {
    expect(resumenLote({ ...base, status: 'AVAILABLE', contracts: [] })).toEqual({ tipo: 'libre' });
    expect(resumenLote({ ...base, status: 'RESERVED', contracts: undefined })).toEqual({ tipo: 'libre' });
  });

  it('vendido pero sin contrato vigente en la app (dato incompleto): lo señala en vez de inventar', () => {
    expect(resumenLote({ ...base, status: 'SOLD', contracts: [] })).toEqual({ tipo: 'sin-contrato' });
  });
});
