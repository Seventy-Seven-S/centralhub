import { describe, it, expect } from 'vitest';
import { computeInstallmentSchedule } from '../contract.service';
import { UnsupportedInterestRateError, InstallmentScheduleMismatchError } from '../../utils/errors';

describe('computeInstallmentSchedule (financiado/plazo, sin interés)', () => {
  it('test 1: división exacta — 60,000 / 60 meses = 1,000 por cuota, 60 cuotas', () => {
    const r = computeInstallmentSchedule(60000, 60, 0);
    expect(r.installmentAmount).toBe(1000);
    expect(r.cuotaAmounts).toHaveLength(60);
    expect(r.cuotaAmounts.every(c => c === 1000)).toBe(true);
  });

  it('test 2: división con residuo — 100,000 / 60 meses, la suma exacta cuadra al centavo', () => {
    const r = computeInstallmentSchedule(100000, 60, 0);
    expect(r.cuotaAmounts).toHaveLength(60);
    // cuotas 1..59 iguales al monto base, la 60 absorbe el residuo
    const base = r.cuotaAmounts[0];
    expect(r.cuotaAmounts.slice(0, 59).every(c => c === base)).toBe(true);
    const last = r.cuotaAmounts[59];
    expect(last).not.toBe(base);
    const sum = r.cuotaAmounts.reduce((a, b) => a + b, 0);
    expect(Math.round(sum * 100) / 100).toBe(100000);
  });

  it('test 3: interestRate distinto de 0 → lanza UnsupportedInterestRateError', () => {
    expect(() => computeInstallmentSchedule(60000, 60, 12)).toThrow(UnsupportedInterestRateError);
  });

  it('test 4: termMonths <= 0 → lanza error (contado fuera de alcance)', () => {
    expect(() => computeInstallmentSchedule(60000, 0, 0)).toThrow();
    expect(() => computeInstallmentSchedule(60000, -1, 0)).toThrow();
  });

  it('test 5: invariante de cuadre — la suma de cuotaAmounts nunca difiere del financiado en más de 1 centavo', () => {
    const r = computeInstallmentSchedule(333333.33, 72, 0);
    const sum = r.cuotaAmounts.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 333333.33)).toBeLessThanOrEqual(0.01);
  });
});

describe('InstallmentScheduleMismatchError', () => {
  it('existe como clase de error con code identificable', () => {
    const err = new InstallmentScheduleMismatchError(99.99, 100);
    expect(err.code).toBe('INSTALLMENT_SCHEDULE_MISMATCH');
    expect(err).toBeInstanceOf(Error);
  });
});
