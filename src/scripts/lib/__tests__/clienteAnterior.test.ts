import { describe, it, expect } from 'vitest';
import { filasConClienteAnterior, mismoCliente } from '../clienteAnterior';

describe('filasConClienteAnterior', () => {
  it('Valle del Roble: usa la columna CODIGO que va después de ESTATUS, no la del cliente actual', () => {
    const filas = [
      ['MZA', 'LOTE', 'CODIGO', 'CLIENTE ACTUAL', 'PRECIO INICIAL', 'PRECIO ACTUAL', 'VENDIDO', 'SEPARADO', 'DISPONIBLE', 'ESTATUS', '2DA. VENTA', 'CODIGO', ' CLIENTE ANTERIOR ', 'TRASPASO O RESCISION'],
      [1, 11, 'V464', 'DULCE MARIA', 350000, 450000, 'VENDIDO', null, null, 'VENDIDO', 'VENDIDO', 'V038', 'CLAUDIO MANUEL GAMEZ RICO', 'RESCISION'],
      [1, 25, 'V070', 'MICAL', 350000, 350000, 'VENDIDO', null, null, 'VENDIDO', 'NA', '-', 'BRANDON DANIEL', 'TRASPASO'],
      [1, 26, 'V071', 'SIN ANTERIOR', 350000, 350000, 'VENDIDO', null, null, 'VENDIDO'],
    ];
    expect(filasConClienteAnterior('V.ROBLE', filas)).toEqual([
      { hoja: 'V.ROBLE', manzana: 1, lote: '11', codigo: 'V038', clienteAnterior: 'CLAUDIO MANUEL GAMEZ RICO', precio: 350000, nota: null },
    ]);
  });

  it('hojas con encabezado en otra fila y columnas en otro orden', () => {
    const filas = [
      ['titulo'],
      [null, 'NOMBRE  DE CLIENTE', 'MANZANA ', 'LOTE', 'CODIGO DE CLIENTE ASIGNADO', 'PRECIO INICIAL', 'PRECIO ACTUAL', 'VENDIDO', 'SEPARADO', 'DISPONIBLE ', 'ESTATUS', 'OBSERVACIONES ', 'CODIGO', 'CLIENTE ANTERIOR'],
      [null, null, 2, 17, null, 210000, 320000, null, null, 'DISPONIBLE', 'DISPONIBLE', 'RESCISION', 'C028', 'Norma Patricia Teran Guerrero'],
    ];
    const r = filasConClienteAnterior('JSA-1', filas);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ manzana: 2, lote: '17', codigo: 'C028', precio: 210000, nota: 'RESCISION' });
  });

  it('una hoja sin CLIENTE ANTERIOR no aporta nada', () => {
    expect(filasConClienteAnterior('SANTANDER', [['MANZANA', 'LOTE', 'CODIGO', 'CLIENTE', 'ESTATUS'], [1, 1, 'S001', 'X', 'VENDIDO']])).toEqual([]);
  });
});

describe('mismoCliente', () => {
  it('tolera acentos, mayúsculas y espacios dobles', () => {
    expect(mismoCliente('JESUS MARTIN GOMEZ IBARRA', 'Jesús Martin Gómez Ibarra')).toBe(true);
    expect(mismoCliente('Deni Sakay  Gutierrez Saldivar', 'Deni Sakay Gutiérrez Saldívar')).toBe(true);
  });

  it('un solo nombre en común no basta', () => {
    expect(mismoCliente('Blanca Rocio Sol Gracia', 'Blanca Janeth Botello Garza')).toBe(false);
    expect(mismoCliente('Maria de la Luz', 'Maria de los Angeles')).toBe(false);
  });
});
