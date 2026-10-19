import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../config/database', () => ({ prisma: {} }));

import { generarFolio } from '../estadoCuenta.service';

afterEach(() => { vi.restoreAllMocks(); });

describe('generarFolio — sufijo aleatorio criptográfico', () => {
  it('conserva el formato EC-AAAAMMDD-PREFIJO-XXXX', () => {
    expect(generarFolio('abc123-contrato')).toMatch(/^EC-\d{8}-ABC123-[A-Z0-9]{4}$/);
  });

  it('no usa Math.random (predecible) para el sufijo', () => {
    const spy = vi.spyOn(Math, 'random');
    for (let i = 0; i < 50; i++) generarFolio('abc123');
    expect(spy).not.toHaveBeenCalled();
  });

  it('el sufijo varía entre folios del mismo contrato y día', () => {
    const sufijos = new Set(Array.from({ length: 50 }, () => generarFolio('abc123').slice(-4)));
    expect(sufijos.size).toBeGreaterThan(40);
  });
});
