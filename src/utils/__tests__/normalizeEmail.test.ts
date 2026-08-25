import { describe, it, expect } from 'vitest';
import { normalizeEmail } from '../normalizeEmail';

describe('normalizeEmail — misma normalización en creación y en búsqueda', () => {
  it('recorta espacios al inicio/final', () => {
    expect(normalizeEmail('  marisol@centralhub.com  ')).toBe('marisol@centralhub.com');
  });

  it('convierte a minúsculas', () => {
    expect(normalizeEmail('Marisol@CentralHub.com')).toBe('marisol@centralhub.com');
  });

  it('NO elimina puntos de la parte local en Gmail — a diferencia de normalizeEmail() de express-validator', () => {
    expect(normalizeEmail('remocas.mat@gmail.com')).toBe('remocas.mat@gmail.com');
  });

  it('NO elimina el "+subaddress" de Gmail', () => {
    expect(normalizeEmail('marisol+facturas@gmail.com')).toBe('marisol+facturas@gmail.com');
  });

  it('combina trim + lowercase + preserva puntos', () => {
    expect(normalizeEmail('  Remocas.Mat@Gmail.com  ')).toBe('remocas.mat@gmail.com');
  });
});
