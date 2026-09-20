import { describe, it, expect } from 'vitest';
import { leerLotesDeHoja } from '../lotesProyectoNuevo';

const hoja = (filas: unknown[][]) => filas;

describe('leerLotesDeHoja', () => {
  const encabezado = ['MANZANA', 'LOTE', 'UNICACION', 'SUPERFICIE', 'PRECIO M2', 'PRECIO'];

  it('lee los lotes y tolera el encabezado mal escrito del archivo', () => {
    // El archivo de Los Cisnes escribe "UNICACION", no "UBICACION".
    const r = leerLotesDeHoja(hoja([encabezado, [1, 1, 'ESQUINA', 340.24, 1075, 365758]]));
    expect(r.lotes).toEqual([
      { manzana: 1, lote: '1', ubicacion: 'ESQUINA', superficie: 340.24, precioM2: 1075, precio: 365758 },
    ]);
    expect(r.descartadas).toBe(0);
  });

  it('descarta y cuenta las filas sin manzana o sin lote', () => {
    const r = leerLotesDeHoja(hoja([encabezado, [1, 1, 'ESQUINA', 200, 1000, 200000], [null, 2, '', null, null, null], ['TOTAL', null, null, null, null, 909]]));
    expect(r.lotes).toHaveLength(1);
    expect(r.descartadas).toBe(2);
  });

  it('reporta los lotes repetidos en vez de dejarlos pasar', () => {
    const r = leerLotesDeHoja(hoja([encabezado, [1, 5, '', 200, 1000, 200000], [1, 5, '', 200, 1000, 200000]]));
    expect(r.repetidos).toEqual(['M1-L5']);
  });

  it('se niega si falta la columna de manzana o la de lote', () => {
    expect(() => leerLotesDeHoja(hoja([['LOTE', 'PRECIO'], [1, 100]]))).toThrow(/manzana/i);
    expect(() => leerLotesDeHoja(hoja([['MANZANA', 'PRECIO'], [1, 100]]))).toThrow(/lote/i);
  });

  it('deja en null el precio y la superficie que no vengan, sin inventarlos', () => {
    const r = leerLotesDeHoja(hoja([['MANZANA', 'LOTE'], [3, 7]]));
    expect(r.lotes[0]).toEqual({ manzana: 3, lote: '7', ubicacion: null, superficie: null, precioM2: null, precio: null });
  });
});
