// computeInstallmentSchedule (pure function — sin Prisma, sin side effects)
// Semántica: financiamiento sin interés (interestRate debe ser 0). La cuota
// base = round2(financiado/plazo); la última cuota absorbe el residuo de
// redondeo, así la suma siempre cuadra exacto contra el financiado.
import { round2 } from '../../utils/money';
import { UnsupportedInterestRateError, InstallmentScheduleMismatchError } from '../../utils/errors';

export interface InstallmentScheduleResult {
  installmentAmount: number; // monto base (cuotas 1..n-1)
  cuotaAmounts: number[];    // longitud === termMonths; la última absorbe el residuo
}

export function computeInstallmentSchedule(
  financingAmount: number,
  termMonths: number,
  interestRate: number,
): InstallmentScheduleResult {
  if (interestRate !== 0) {
    throw new UnsupportedInterestRateError(interestRate);
  }
  if (!termMonths || termMonths <= 0) {
    throw new Error('termMonths debe ser mayor a 0 (contado está fuera de alcance de este cálculo)');
  }

  const financed = round2(financingAmount);
  const base = round2(financed / termMonths);

  const cuotaAmounts = new Array(termMonths).fill(base);
  const last = round2(financed - base * (termMonths - 1));
  cuotaAmounts[termMonths - 1] = last;

  const sum = cuotaAmounts.reduce((a, b) => a + b, 0);
  if (Math.abs(round2(sum) - financed) > 0.01) {
    throw new InstallmentScheduleMismatchError(round2(sum), financed);
  }

  return { installmentAmount: base, cuotaAmounts };
}
