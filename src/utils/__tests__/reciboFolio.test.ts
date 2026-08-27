import { describe, it, expect } from 'vitest';
import { buildReciboFolio } from '../reciboFolio';

describe('buildReciboFolio (backend) — debe coincidir exacto con reciboHelpers.ts del frontend', () => {
  it('ejemplo del formato acordado', () => {
    expect(buildReciboFolio('V148', 19, 60)).toBe('REC-V148-19de60');
  });

  it('cuota de un solo dígito, sin ceros a la izquierda', () => {
    expect(buildReciboFolio('SAN-004', 3, 24)).toBe('REC-SAN-004-3de24');
  });
});
