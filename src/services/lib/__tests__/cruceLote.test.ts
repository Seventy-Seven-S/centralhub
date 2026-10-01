import { describe, it, expect } from 'vitest';
import { elLoteConcuerda } from '../cruceLote';

const lotes = (...pares: Array<[number, string]>) =>
  pares.map(([manzana, lotNumber]) => ({ manzana, lotNumber }));

describe('elLoteConcuerda', () => {
  it('concuerda cuando el contrato tiene ese lote', () => {
    expect(elLoteConcuerda(lotes([13, '13']), 13, '13')).toBe(true);
  });

  it('concuerda si el contrato tiene varios y uno coincide', () => {
    expect(elLoteConcuerda(lotes([6, '4'], [6, '5']), 6, '5')).toBe(true);
  });

  it('NO concuerda cuando el lote es de otro contrato', () => {
    // El archivo traía V292 en tres filas de clientes distintos: la fila de
    // M13-L30 era de Juan Ayala (V393), no de Irvin (V292). Sin este cruce se
    // le escribió a Irvin el mes de Juan.
    expect(elLoteConcuerda(lotes([13, '13']), 13, '30')).toBe(false);
  });

  it('tolera el lote como número o como texto', () => {
    expect(elLoteConcuerda(lotes([1, '5']), 1, 5 as unknown as string)).toBe(true);
    expect(elLoteConcuerda(lotes([1, '05']), 1, '5')).toBe(true);
  });

  it('sin dato de lote en el archivo no bloquea: no hay con qué cruzar', () => {
    expect(elLoteConcuerda(lotes([1, '5']), null, null)).toBe(true);
  });

  it('un contrato sin lotes tampoco bloquea', () => {
    expect(elLoteConcuerda([], 1, '5')).toBe(true);
  });
});
