import { describe, it, expect } from 'vitest';
import { resumirPorGrupo } from './resumenPorGrupo';

const g = (clave: string, etiqueta: string, monto: number) => ({ clave, etiqueta, monto });
const resumir = (items: ReturnType<typeof g>[]) =>
  resumirPorGrupo(items, i => i.clave, i => i.etiqueta, i => i.monto);

describe('resumirPorGrupo', () => {
  it('agrupa con conteo y monto', () => {
    expect(resumir([g('a', 'Central', 100), g('a', 'Central', 50), g('b', 'Planos', 20)])).toEqual([
      { clave: 'a', etiqueta: 'Central', cantidad: 2, monto: 150 },
      { clave: 'b', etiqueta: 'Planos', cantidad: 1, monto: 20 },
    ]);
  });

  it('ordena por monto, no por cantidad', () => {
    const r = resumir([g('a', 'A', 1), g('a', 'A', 1), g('a', 'A', 1), g('b', 'B', 500)]);
    expect(r.map(x => x.clave)).toEqual(['b', 'a']);
  });

  it('lista vacía → resumen vacío', () => {
    expect(resumir([])).toEqual([]);
  });

  it('los negativos restan de su grupo en vez de ignorarse', () => {
    expect(resumir([g('a', 'A', 100), g('a', 'A', -30)])[0].monto).toBe(70);
  });

  it('no inventa grupos que no aparecen', () => {
    expect(resumir([g('a', 'A', 1)]).map(x => x.clave)).toEqual(['a']);
  });

  it('un monto que llega como texto (Decimal de Prisma) se suma como número', () => {
    const items = [{ c: 'a', e: 'A', m: '1234.50' }, { c: 'a', e: 'A', m: '0.50' }];
    const r = resumirPorGrupo(items, i => i.c, i => i.e, i => Number(i.m));
    expect(r[0].monto).toBe(1235);
  });
});
