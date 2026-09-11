import { describe, it, expect } from 'vitest';
import { deducirTipo, validarTraspaso } from '../traspaso';

describe('deducirTipo — la forma sale del destino, no se le pregunta a nadie', () => {
  it('mismo proyecto y mismo lote: cambia el titular', () => {
    expect(deducirTipo({ projectId: 'p1', lotIds: ['l1'] }, { projectId: 'p1', lotIds: ['l1'] }))
      .toBe('CAMBIO_TITULAR');
  });

  it('mismo proyecto pero otro lote: es reubicación', () => {
    expect(deducirTipo({ projectId: 'p1', lotIds: ['l1'] }, { projectId: 'p1', lotIds: ['l2'] }))
      .toBe('REUBICACION');
  });

  it('otro proyecto: es reubicación aunque el lote se llame igual', () => {
    expect(deducirTipo({ projectId: 'p1', lotIds: ['l1'] }, { projectId: 'p2', lotIds: ['l1'] }))
      .toBe('REUBICACION');
  });

  it('los mismos lotes en otro orden siguen siendo el mismo lote', () => {
    expect(deducirTipo({ projectId: 'p1', lotIds: ['l1', 'l2'] }, { projectId: 'p1', lotIds: ['l2', 'l1'] }))
      .toBe('CAMBIO_TITULAR');
  });

  it('conservar solo una parte de los lotes es reubicación', () => {
    // Caso D073: compró 3, se queda con 1.
    expect(deducirTipo({ projectId: 'p1', lotIds: ['l1', 'l2', 'l3'] }, { projectId: 'p1', lotIds: ['l1'] }))
      .toBe('REUBICACION');
  });
});

describe('validarTraspaso', () => {
  const base = {
    montoAbonado: 40000, montoRespetado: 40000,
    estadoOrigen: 'ACTIVE', estadoLoteDestino: 'AVAILABLE', mismoLote: false,
  };

  it('acepta un traspaso que respeta todo lo abonado', () => {
    expect(validarTraspaso(base)).toBeNull();
  });

  it('acepta respetar menos, si viene la nota', () => {
    expect(validarTraspaso({ ...base, montoRespetado: 10000, nota: 'Solo el enganche' })).toBeNull();
  });

  it('EXIGE nota cuando no se respeta todo', () => {
    expect(validarTraspaso({ ...base, montoRespetado: 10000 })).toMatch(/nota/i);
    expect(validarTraspaso({ ...base, montoRespetado: 10000, nota: '   ' })).toMatch(/nota/i);
  });

  it('no se puede respetar más de lo que el cliente pagó', () => {
    expect(validarTraspaso({ ...base, montoRespetado: 50000, nota: 'x' })).toMatch(/más de lo abonado/i);
  });

  it('el monto respetado no puede ser negativo', () => {
    expect(validarTraspaso({ ...base, montoRespetado: -1, nota: 'x' })).toMatch(/negativo/i);
  });

  it('respetar cero es válido, con nota', () => {
    expect(validarTraspaso({ ...base, montoRespetado: 0, nota: 'No se le respeta nada' })).toBeNull();
  });

  it('un contrato ya traspasado no se traspasa otra vez', () => {
    expect(validarTraspaso({ ...base, estadoOrigen: 'TRASPASADO' })).toMatch(/ya fue traspasado/i);
  });

  it('un contrato cancelado o rescindido tampoco', () => {
    expect(validarTraspaso({ ...base, estadoOrigen: 'CANCELED' })).toMatch(/cancelado o rescindido/i);
    expect(validarTraspaso({ ...base, estadoOrigen: 'RESCISSION' })).toMatch(/cancelado o rescindido/i);
  });

  it('el lote destino debe estar disponible', () => {
    expect(validarTraspaso({ ...base, estadoLoteDestino: 'SOLD' })).toMatch(/disponible/i);
  });

  it('en cambio de titular el lote destino es el mismo, así que no se exige disponible', () => {
    expect(validarTraspaso({ ...base, estadoLoteDestino: 'SOLD', mismoLote: true })).toBeNull();
  });

  it('los centavos de punto flotante no disparan la nota obligatoria', () => {
    expect(validarTraspaso({ ...base, montoRespetado: 40000.004 })).toBeNull();
  });
});
