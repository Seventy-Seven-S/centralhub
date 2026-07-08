import { describe, it, expect } from 'vitest';
import { round2, buildScheduleAmounts, parsePlazo } from '../installments';

const sum = (a: number[]) => round2(a.reduce((s, x) => s + x, 0));

describe('round2', () => {
  it('redondea a 2 decimales', () => {
    expect(round2(2304.283333)).toBe(2304.28);
    expect(round2(3916.666)).toBe(3916.67);
  });
});

describe('buildScheduleAmounts', () => {
  it('caso exacto: 480000 / 60 = 8000 cada una', () => {
    const a = buildScheduleAmounts(480000, 60);
    expect(a).toHaveLength(60);
    expect(a.every(x => x === 8000)).toBe(true);
    expect(sum(a)).toBe(480000);
  });

  it('con redondeo: la suma sigue siendo exacta (138257 / 60)', () => {
    const a = buildScheduleAmounts(138257, 60);
    expect(a).toHaveLength(60);
    expect(a[0]).toBe(2304.28);              // round2(138257/60)
    expect(sum(a)).toBe(138257);             // la última absorbe el resto
  });

  it('con redondeo: 235000 / 60', () => {
    const a = buildScheduleAmounts(235000, 60);
    expect(a[0]).toBe(3916.67);
    expect(sum(a)).toBe(235000);
  });

  it('plazo 0 → arreglo vacío', () => {
    expect(buildScheduleAmounts(100000, 0)).toEqual([]);
  });
});

describe('parsePlazo', () => {
  it('vacío → inferido (months null)', () => {
    expect(parsePlazo('')).toEqual({ months: null, isContado: false, source: 'inferido' });
  });
  it('"DE CONTADO" → contado', () => {
    expect(parsePlazo('DE CONTADO')).toEqual({ months: 0, isContado: true, source: 'contado' });
  });
  it('"5" → 60 meses (años)', () => {
    expect(parsePlazo('5')).toEqual({ months: 60, isContado: false, source: 'codigos' });
  });
  it('"4a-2m" → 50 meses', () => {
    expect(parsePlazo('4a-2m')).toEqual({ months: 50, isContado: false, source: 'codigos' });
  });
  it('"4a" → 48 meses', () => {
    expect(parsePlazo('4a')).toEqual({ months: 48, isContado: false, source: 'codigos' });
  });
});
