import { describe, it, expect } from 'vitest';
import { precioDeLotes, resumenLotes, validarCotitulares, Cotitular } from './contratoMultiLote';

const lote = (id: string, manzana: number, n: string, precio: number, area = 200) =>
  ({ id, manzana, lotNumber: n, currentPrice: precio, areaM2: area });

describe('precioDeLotes', () => {
  it('suma el precio de todos los lotes elegidos', () => {
    expect(precioDeLotes([lote('a',1,'1',235000), lote('b',1,'2',235000)])).toBe(470000);
  });
  it('sin lotes da cero, no NaN', () => {
    expect(precioDeLotes([])).toBe(0);
  });
});

describe('resumenLotes', () => {
  it('describe un solo lote', () => {
    expect(resumenLotes([lote('a',3,'20',260000)])).toBe('M3 L-20');
  });
  it('junta varios en orden', () => {
    expect(resumenLotes([lote('b',6,'5',1), lote('a',6,'4',1)])).toBe('M6 L-4, M6 L-5');
  });
  it('sin lotes no inventa texto', () => {
    expect(resumenLotes([])).toBe('');
  });
});

describe('validarCotitulares', () => {
  const ok: Cotitular = { firstName: 'Ana', lastName: 'Pérez', ine: 'PEAN800101MTSRNA01' };

  it('acepta que no haya cotitulares: es lo normal', () => {
    expect(validarCotitulares([])).toBeNull();
  });
  it('acepta uno bien capturado', () => {
    expect(validarCotitulares([ok])).toBeNull();
  });
  it('exige nombre y apellidos de cada cotitular', () => {
    expect(validarCotitulares([{ ...ok, firstName: '  ' }])).toMatch(/nombre/i);
    expect(validarCotitulares([{ ...ok, lastName: '' }])).toMatch(/apellido/i);
  });
  it('exige el INE, que es lo que lo identifica en el contrato', () => {
    expect(validarCotitulares([{ ...ok, ine: '' }])).toMatch(/INE/i);
  });
  it('señala cuál de varios está incompleto', () => {
    expect(validarCotitulares([ok, { ...ok, lastName: '' }])).toMatch(/2/);
  });
});
