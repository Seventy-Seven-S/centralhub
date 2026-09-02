import { describe, it, expect } from 'vitest';
import { normalizeForSearch } from './utils';

describe('normalizeForSearch — búsqueda sin distinguir acentos (las secretarias no los escriben)', () => {
  it('quita acentos de vocales', () => {
    expect(normalizeForSearch('José')).toBe('jose');
  });

  it('busca sin acento y encuentra texto con acento', () => {
    expect(normalizeForSearch('José Martínez')).toBe(normalizeForSearch('jose martinez'));
  });

  it('busca con acento y encuentra texto sin acento (por si acaso)', () => {
    expect(normalizeForSearch('María')).toBe(normalizeForSearch('Maria'));
  });

  it('normaliza a minúsculas', () => {
    expect(normalizeForSearch('MARTÍNEZ')).toBe('martinez');
  });

  it('la ñ también se normaliza (igual de fácil de omitir al escribir rápido)', () => {
    expect(normalizeForSearch('Muñoz')).toBe(normalizeForSearch('Munoz'));
  });

  it('cadena vacía', () => {
    expect(normalizeForSearch('')).toBe('');
  });
});
