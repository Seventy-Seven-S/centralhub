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

describe('formatDateUTC', () => {
  it('una fecha guardada a medianoche UTC se muestra con ese mismo día, no con el anterior (recibos en México)', async () => {
    const { formatDateUTC } = await import('./utils');
    expect(formatDateUTC('2026-09-04T00:00:00.000Z')).toBe('04 de septiembre de 2026');
    expect(formatDateUTC('2026-09-04T00:00:00.000Z', 'short')).toBe('04 sep 2026');
  });
});
