// src/utils/errors.ts
// Custom error classes para distinguir errores de negocio de errores genéricos.

export class DepositExceedsDownPaymentError extends Error {
  readonly code = 'DEPOSIT_EXCEEDS_DOWNPAYMENT' as const;

  constructor(
    public readonly totalDeposit: number,
    public readonly downPayment: number,
  ) {
    super(`Depósito (${totalDeposit}) excede enganche (${downPayment})`);
    this.name = 'DepositExceedsDownPaymentError';
  }
}
