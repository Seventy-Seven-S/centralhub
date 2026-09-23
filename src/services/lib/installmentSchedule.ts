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
  // La mensualidad va en PESOS REDONDOS: así es como se cobra en ventanilla y
  // como se le dice al cliente. $256,000 a 60 meses son $4,267, no $4,266.67.
  // La ÚLTIMA cuota absorbe el residuo para que la suma cierre exacto contra
  // lo financiado; si no, al cliente le sobrarían o le faltarían pesos al
  // final y el saldo nunca llegaría a cero.
  // Se redondea al peso más cercano, salvo cuando eso dejaría la última cuota
  // en cero o negativa: con montos muy chicos para un plazo largo, medio peso
  // de más multiplicado por todas las cuotas se come la última. Ahí se
  // redondea hacia abajo y la última queda como la mayor.
  const exacta = financed / termMonths;
  let base = Math.round(exacta);
  if (round2(financed - base * (termMonths - 1)) <= 0) base = Math.floor(exacta);

  const cuotaAmounts = new Array(termMonths).fill(base);
  const last = round2(financed - base * (termMonths - 1));
  cuotaAmounts[termMonths - 1] = last;

  const sum = cuotaAmounts.reduce((a, b) => a + b, 0);
  if (Math.abs(round2(sum) - financed) > 0.01) {
    throw new InstallmentScheduleMismatchError(round2(sum), financed);
  }

  return { installmentAmount: base, cuotaAmounts };
}

/**
 * Operación inversa de computeInstallmentSchedule: la MENSUALIDAD es el dato
 * duro y el plazo se deriva de ella.
 *
 * Se usa cuando el monto exacto viene de fuera (el archivo que armaron las
 * secretarias a partir de los contratos firmados) y no debe recalcularse
 * dividiendo. computeInstallmentSchedule parte del plazo y calcula la cuota;
 * aquí es al revés, porque lo que el cliente tiene en su contrato es el monto.
 *
 * La última cuota absorbe el residuo, igual que en la otra función, así la
 * suma cuadra exacto contra el financiado.
 */
export function buildScheduleFromInstallment(
  financingAmount: number,
  installmentAmount: number,
): InstallmentScheduleResult {
  if (!(installmentAmount > 0)) {
    throw new Error('La mensualidad debe ser mayor a 0');
  }
  const financed = round2(financingAmount);
  const cuota = round2(installmentAmount);

  // Una mensualidad que cubre todo el financiamiento = una sola cuota.
  if (cuota >= financed) {
    return { installmentAmount: cuota, cuotaAmounts: [financed] };
  }

  // Sin round2 sobre la razón: redondear 10000/9999 = 1.0001 a 1.00 perdía la
  // última cuota. El epsilon absorbe el error de punto flotante cuando la
  // división es exacta (50000/5000 debe dar 10, no 11).
  const n = Math.max(1, Math.ceil(financed / cuota - 1e-9));
  const cuotaAmounts = new Array(n).fill(cuota);
  cuotaAmounts[n - 1] = round2(financed - cuota * (n - 1));

  const sum = cuotaAmounts.reduce((a, b) => a + b, 0);
  if (Math.abs(round2(sum) - financed) > 0.01) {
    throw new InstallmentScheduleMismatchError(round2(sum), financed);
  }
  return { installmentAmount: cuota, cuotaAmounts };
}
