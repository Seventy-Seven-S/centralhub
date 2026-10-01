import { describe, it, expect } from 'vitest';
import { elLoteConcuerda, lotesDeLaCelda } from '../cruceLote';

const lotes = (...pares: Array<[number, string]>) =>
  pares.map(([manzana, lotNumber]) => ({ manzana, lotNumber }));

describe('lotesDeLaCelda', () => {
  it('lee un solo lote', () => {
    expect(lotesDeLaCelda('13')).toEqual(['13']);
    expect(lotesDeLaCelda(13)).toEqual(['13']);
  });

  it('lee los varios lotes que el equipo escribe en una celda', () => {
    // Así es como vienen en el archivo.
    expect(lotesDeLaCelda('1 Y 2')).toEqual(['1', '2']);
    expect(lotesDeLaCelda('18,19')).toEqual(['18', '19']);
    expect(lotesDeLaCelda('1,2,3,8,9,10,11,12')).toEqual(['1','2','3','8','9','10','11','12']);
    expect(lotesDeLaCelda('22 Y 23')).toEqual(['22', '23']);
  });

  it('devuelve vacío cuando no hay nada que leer', () => {
    expect(lotesDeLaCelda(null)).toEqual([]);
    expect(lotesDeLaCelda('')).toEqual([]);
    expect(lotesDeLaCelda('M1 L3 Y M7 L3')).toEqual(['1', '3', '7', '3']);
  });
});

describe('elLoteConcuerda', () => {
  it('concuerda cuando el contrato tiene ese lote', () => {
    expect(elLoteConcuerda(lotes([13, '13']), 13, '13')).toBe(true);
  });

  it('concuerda con varios lotes escritos en una sola celda', () => {
    // V002: la fila dice "1 Y 2" y el contrato tiene los dos.
    expect(elLoteConcuerda(lotes([1, '1'], [1, '2']), 1, '1 Y 2')).toBe(true);
  });

  it('NO concuerda cuando el lote es de otro contrato', () => {
    // El archivo traía V292 en tres filas: la de M13-L30 era de Juan Ayala
    // (V393), no de Irvin (V292). Sin este cruce se le escribió el mes de otro.
    expect(elLoteConcuerda(lotes([13, '13']), 13, '30')).toBe(false);
  });

  it('basta que uno de los lotes coincida: el archivo puede traer de más', () => {
    expect(elLoteConcuerda(lotes([6, '4']), 6, '4 Y 5')).toBe(true);
  });

  it('tolera el lote con ceros a la izquierda', () => {
    expect(elLoteConcuerda(lotes([1, '05']), 1, '5')).toBe(true);
  });

  it('sin dato de lote o sin lotes en el contrato, no bloquea', () => {
    expect(elLoteConcuerda(lotes([1, '5']), null, null)).toBe(true);
    expect(elLoteConcuerda([], 1, '5')).toBe(true);
  });
});
