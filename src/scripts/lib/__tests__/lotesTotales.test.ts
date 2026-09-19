import { describe, it, expect } from 'vitest';
import { estatusALote, esFilaDeLote, partirLoteFusionado } from '../lotesTotales';

describe('estatusALote', () => {
  it('traduce los tres estados normales', () => {
    expect(estatusALote('VENDIDO')).toBe('SOLD');
    expect(estatusALote('DISPONIBLE')).toBe('AVAILABLE');
    expect(estatusALote('SEPARADO')).toBe('RESERVED');
  });

  it('deja como no disponible lo que no es inventario vendible', () => {
    // ISASI = lotes del dueño del terreno en los JSA. RESACA = terreno
    // inundable en Magnolia. A EQUIPAMIENTO = donación al municipio.
    for (const e of ['ISASI', 'ISASSI', 'RESACA', 'A EQUIPAMIENTO', 'ROGELIO']) {
      expect(estatusALote(e)).toBe('UNAVAILABLE');
    }
  });

  it('no adivina con un estatus que no conoce', () => {
    expect(estatusALote('ALGO NUEVO')).toBeNull();
    expect(estatusALote('')).toBeNull();
  });
});

describe('esFilaDeLote', () => {
  const head = ['MANZANA', 'LOTE', 'PRECIO', 'ESTATUS'];
  it('acepta una fila con manzana, lote y estatus', () => {
    expect(esFilaDeLote([1, 5, 250000, 'VENDIDO'], head)).toBe(true);
  });
  it('rechaza el relleno de la hoja, que trae manzana y lote pero sin estatus', () => {
    expect(esFilaDeLote([1, 5, null, null], head)).toBe(false);
  });
  it('rechaza una fila sin manzana o sin lote', () => {
    expect(esFilaDeLote([null, 5, 1, 'VENDIDO'], head)).toBe(false);
    expect(esFilaDeLote([1, null, 1, 'VENDIDO'], head)).toBe(false);
  });
});

describe('partirLoteFusionado', () => {
  const existen = new Set(['18', '19', '20', '21']);

  it('parte un lote escrito como par vendido junto', () => {
    // V.ROBLE escribe "1920" cuando los lotes 19 y 20 se vendieron como uno.
    expect(partirLoteFusionado('1920', existen)).toEqual(['19', '20']);
    expect(partirLoteFusionado('1819', existen)).toEqual(['18', '19']);
    expect(partirLoteFusionado('2021', existen)).toEqual(['20', '21']);
  });

  it('no parte un lote que existe tal cual', () => {
    expect(partirLoteFusionado('19', existen)).toBeNull();
  });

  it('no parte si las mitades no son lotes consecutivos que existan', () => {
    expect(partirLoteFusionado('1930', existen)).toBeNull();
    expect(partirLoteFusionado('9999', existen)).toBeNull();
  });

  it('no parte números que no son de cuatro dígitos', () => {
    expect(partirLoteFusionado('192', existen)).toBeNull();
    expect(partirLoteFusionado('19202', existen)).toBeNull();
  });
});
