import { describe, it, expect } from 'vitest';
import { computeInstallmentSchedule } from '../installmentSchedule';

describe('las mensualidades van en pesos redondos', () => {
  it('reparte en pesos enteros y deja el residuo en la última', () => {
    // El caso que reportó la secretaria: $256,000 a 60 meses daba $4,266.67.
    const r = computeInstallmentSchedule(256000, 60, 0);
    expect(r.installmentAmount).toBe(4267);
    expect(r.cuotaAmounts.slice(0, 59).every(c => Number.isInteger(c))).toBe(true);
    expect(r.cuotaAmounts[59]).toBe(256000 - 4267 * 59);
    expect(r.cuotaAmounts.reduce((a, b) => a + b, 0)).toBeCloseTo(256000, 2);
  });

  it('la suma sigue cerrando exacto contra lo financiado', () => {
    for (const [monto, plazo] of [[250000, 72], [784536, 60], [219999.99, 60], [100000, 24]] as const) {
      const r = computeInstallmentSchedule(monto, plazo, 0);
      expect(r.cuotaAmounts.reduce((a, b) => a + b, 0)).toBeCloseTo(monto, 2);
    }
  });

  it('cuando el monto ya es divisible, todas quedan iguales', () => {
    const r = computeInstallmentSchedule(240000, 60, 0);
    expect(r.installmentAmount).toBe(4000);
    expect(new Set(r.cuotaAmounts).size).toBe(1);
  });

  it('la última cuota nunca sale negativa ni absurda', () => {
    const r = computeInstallmentSchedule(100, 60, 0);
    expect(r.cuotaAmounts[59]).toBeGreaterThan(0);
    expect(r.cuotaAmounts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });
});
