import { describe, it, expect } from 'vitest';
import { leerColores, conColor, veloDeColor, esColorProyecto } from './colorProyecto';

describe('colorProyecto', () => {
  it('lee solo colores conocidos y descarta lo demás', () => {
    expect(leerColores({ a: 'verde', b: 'naranja', c: 3, d: 'morado' })).toEqual({ a: 'verde', d: 'morado' });
    expect(leerColores(null)).toEqual({});
    expect(leerColores(['verde'])).toEqual({});
  });
  it('asigna, cambia y quita el color de un proyecto sin tocar los otros', () => {
    const base = { a: 'verde' as const, b: 'rojo' as const };
    expect(conColor(base, 'c', 'azul')).toEqual({ a: 'verde', b: 'rojo', c: 'azul' });
    expect(conColor(base, 'a', 'rosa')).toEqual({ a: 'rosa', b: 'rojo' });
    expect(conColor(base, 'a', null)).toEqual({ b: 'rojo' });
  });
  it('el velo es translúcido (entre 15 y 20%)', () => {
    expect(veloDeColor('azul')).toBe('linear-gradient(rgba(96, 165, 250, 0.18), rgba(96, 165, 250, 0.18))');
  });
  it('no confunde propiedades del objeto con colores', () => {
    expect(esColorProyecto('toString')).toBe(false);
  });
});
