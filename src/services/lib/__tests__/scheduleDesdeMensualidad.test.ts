import { describe, it, expect } from 'vitest';
import { buildScheduleFromInstallment } from '../installmentSchedule';

describe('buildScheduleFromInstallment — la mensualidad manda, el plazo se deriva', () => {
  it('caso D073: $125,000 a $4,688 → 27 cuotas, la última absorbe el residuo', () => {
    const r = buildScheduleFromInstallment(125000, 4688);
    expect(r.cuotaAmounts).toHaveLength(27);
    expect(r.cuotaAmounts.slice(0, 26).every(c => c === 4688)).toBe(true);
    expect(r.cuotaAmounts[26]).toBe(3112);
  });

  it('la suma SIEMPRE cuadra exacto contra el financiado', () => {
    for (const [fin, cuota] of [[125000, 4688], [244000, 5084], [96500, 2011], [1, 1], [99999.99, 3333]] as const) {
      const suma = buildScheduleFromInstallment(fin, cuota).cuotaAmounts.reduce((a, b) => a + b, 0);
      expect(Math.round(suma * 100) / 100).toBe(Math.round(fin * 100) / 100);
    }
  });

  it('cuando divide exacto no inventa una cuota de más', () => {
    const r = buildScheduleFromInstallment(50000, 5000);
    expect(r.cuotaAmounts).toHaveLength(10);
    expect(r.cuotaAmounts.every(c => c === 5000)).toBe(true);
  });

  it('la última cuota nunca queda en cero ni negativa', () => {
    for (const [fin, cuota] of [[10000, 3000], [10000, 5000], [10000, 9999], [10000, 10000]] as const) {
      const ult = buildScheduleFromInstallment(fin, cuota).cuotaAmounts.at(-1)!;
      expect(ult).toBeGreaterThan(0);
      expect(ult).toBeLessThanOrEqual(cuota);
    }
  });

  it('una mensualidad mayor al financiado deja una sola cuota por el total', () => {
    const r = buildScheduleFromInstallment(3000, 5000);
    expect(r.cuotaAmounts).toEqual([3000]);
  });

  it('rechaza mensualidad en cero o negativa en vez de ciclar sin fin', () => {
    expect(() => buildScheduleFromInstallment(125000, 0)).toThrow();
    expect(() => buildScheduleFromInstallment(125000, -100)).toThrow();
  });

  it('devuelve installmentAmount = la mensualidad pedida, no una calculada', () => {
    expect(buildScheduleFromInstallment(125000, 4688).installmentAmount).toBe(4688);
  });
});
