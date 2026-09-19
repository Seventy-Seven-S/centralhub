import { describe, it, expect } from 'vitest';
import { nombreDeCampo, valorLegible } from './cambiosContrato';

describe('nombreDeCampo', () => {
  it('traduce los nombres del schema a como habla la inmobiliaria', () => {
    expect(nombreDeCampo('installmentAmount')).toBe('Mensualidad');
    expect(nombreDeCampo('moraMonthsCount')).toBe('Meses en mora');
  });
  it('deja pasar un campo que no conoce en vez de romperse', () => {
    expect(nombreDeCampo('campoNuevo')).toBe('campoNuevo');
  });
});

describe('valorLegible', () => {
  it('pone signo de pesos donde el valor es dinero', () => {
    expect(valorLegible('installmentAmount', '3473')).toBe('$3,473.00');
    expect(valorLegible('balance', '207623')).toBe('$207,623.00');
  });
  it('dice meses en el plazo', () => {
    expect(valorLegible('installmentCount', '72')).toBe('72 meses');
  });
  it('no inventa formato donde no lo hay', () => {
    expect(valorLegible('startDate', '2025-09')).toBe('2025-09');
    expect(valorLegible('balance', null)).toBe('—');
  });
});
