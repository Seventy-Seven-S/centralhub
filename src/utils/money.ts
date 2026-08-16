// Redondeo a 2 decimales — única fuente de verdad para cálculos financieros.
// Usado por computeDepositSplit/computeInstallmentSchedule (contract.service.ts)
// y por payment.service.ts, para mantener la misma disciplina en todo el
// dinero que toca el sistema.
export const round2 = (n: number): number => Math.round(n * 100) / 100;
