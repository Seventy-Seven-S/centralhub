import { describe, it, expect } from 'vitest';
import { cantidadEnLetra } from './cantidadEnLetra';

describe('cantidadEnLetra', () => {
  it.each([
    [14250, 'CATORCE MIL DOSCIENTOS CINCUENTA PESOS 00/100 M.N.'],
    [7500, 'SIETE MIL QUINIENTOS PESOS 00/100 M.N.'],
    [10000, 'DIEZ MIL PESOS 00/100 M.N.'],
    [100, 'CIEN PESOS 00/100 M.N.'],
    [101, 'CIENTO UN PESOS 00/100 M.N.'],
    [1, 'UN PESO 00/100 M.N.'],
    [21000, 'VEINTIÚN MIL PESOS 00/100 M.N.'],
    [1000, 'MIL PESOS 00/100 M.N.'],
    [35999.5, 'TREINTA Y CINCO MIL NOVECIENTOS NOVENTA Y NUEVE PESOS 50/100 M.N.'],
    [1000000, 'UN MILLÓN DE PESOS 00/100 M.N.'],
    [1240992, 'UN MILLÓN DOSCIENTOS CUARENTA MIL NOVECIENTOS NOVENTA Y DOS PESOS 00/100 M.N.'],
    [2500000, 'DOS MILLONES QUINIENTOS MIL PESOS 00/100 M.N.'],
    [0, 'CERO PESOS 00/100 M.N.'],
  ])('%d → %s', (n, letra) => {
    expect(cantidadEnLetra(n)).toBe(letra);
  });
});
