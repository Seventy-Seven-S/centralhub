import { describe, it, expect } from 'vitest';
import { PLAZOS_COMUNES, validarPlazo, etiquetaPlazo } from './plazoContrato';

describe('PLAZOS_COMUNES', () => {
  it('incluye los que el negocio usa de verdad, no solo 60/72/84', () => {
    // JSA 1 vende a 2 y a 4 años; el menú cerrado forzaba capturas erróneas.
    for (const m of [24, 48, 60, 72]) expect(PLAZOS_COMUNES).toContain(m);
  });
});

describe('validarPlazo', () => {
  it('acepta cualquier número entero de meses', () => {
    expect(validarPlazo('24')).toBeNull();
    expect(validarPlazo('47')).toBeNull();
    expect(validarPlazo('120')).toBeNull();
  });

  it('rechaza lo que no es un plazo', () => {
    expect(validarPlazo('')).toMatch(/plazo/i);
    expect(validarPlazo('0')).toMatch(/mayor/i);
    expect(validarPlazo('-12')).toMatch(/mayor/i);
    expect(validarPlazo('abc')).toMatch(/n[úu]mero/i);
    expect(validarPlazo('12.5')).toMatch(/entero/i);
  });

  it('rechaza un plazo absurdo, que casi siempre es un dedazo', () => {
    expect(validarPlazo('600')).toMatch(/demasiado/i);
  });
});

describe('etiquetaPlazo', () => {
  it('dice los años cuando el plazo es exacto', () => {
    expect(etiquetaPlazo(24)).toBe('24 meses (2 años)');
    expect(etiquetaPlazo(60)).toBe('60 meses (5 años)');
  });
  it('no inventa años cuando no cuadra', () => {
    expect(etiquetaPlazo(47)).toBe('47 meses');
  });
});
