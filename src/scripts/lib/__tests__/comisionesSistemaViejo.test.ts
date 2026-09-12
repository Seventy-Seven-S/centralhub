import { describe, it, expect } from 'vitest';
import { leerComisionesDeMatriz } from '../comisionesSistemaViejo';

// Encabezado real: MANZANA/LOTE en 1-2, COMISION en 4, ASESOR en 7,
// ESTATUS en 8, RECIBO en 9. Arriba hay filas de resumen que no son datos.
const H = [null, 'MANZANA', 'LOTE', null, 'COMISION', 'ENGANCHE ', null, null, null, 'RECIBO', null, null];
const RESUMEN = [null, null, null, null, 2353626, 4044353, null, null, null, 2356223, null, null];
const fila = (mz: any, lt: any, com: any, ase: string, est: string, rec: any) =>
  [null, mz, lt, null, com, 15000, null, ase, est, rec, null, null];

describe('leerComisionesDeMatriz', () => {
  it('toma el RECIBO (lo realmente pagado), no la COMISION calculada', () => {
    const { comisiones } = leerComisionesDeMatriz([H, RESUMEN, fila(1, 21, 10400, 'Karina', 'PAGADO', 10000)]);
    expect(comisiones).toHaveLength(1);
    expect(comisiones[0]).toMatchObject({ manzana: 1, lote: '21', asesor: 'Karina', monto: 10000, comisionCalculada: 10400 });
  });

  it('ignora las filas de resumen de arriba: no traen manzana ni lote', () => {
    const { comisiones } = leerComisionesDeMatriz([H, RESUMEN,
      [null, null, null, null, null, null, null, null, 'VARIACION $', -2597, null, null]]);
    expect(comisiones).toEqual([]);
  });

  it('una comisión en cero no se carga: no hubo egreso', () => {
    const { comisiones, enCero } = leerComisionesDeMatriz([H, fila(2, 5, 0, 'Aldo', '-', 0)]);
    expect(comisiones).toEqual([]);
    expect(enCero).toHaveLength(1);
  });

  it('conserva el estatus tal cual para poder distinguir lo no pagado', () => {
    const { comisiones } = leerComisionesDeMatriz([H, fila(1, 68, 10400, 'Susana', '', 10000)]);
    expect(comisiones[0].estatus).toBe('');
  });

  it('el número de lote se guarda como texto: hay lotes tipo "12A"', () => {
    const { comisiones } = leerComisionesDeMatriz([H, fila(3, 12, 11200, 'Mary', 'PAGADO', 11200)]);
    expect(comisiones[0].lote).toBe('12');
    expect(typeof comisiones[0].lote).toBe('string');
  });

  it('suma lo que reporta: el total es la suma de los RECIBO', () => {
    const { comisiones } = leerComisionesDeMatriz([H, RESUMEN,
      fila(1, 1, 12698, 'Leo', 'PAGADO', 12698),
      fila(1, 21, 10400, 'Karina', 'PAGADO', 10000),
      fila(2, 5, 0, 'Aldo', '-', 0),
    ]);
    expect(comisiones.reduce((s, c) => s + c.monto, 0)).toBe(22698);
  });
});
