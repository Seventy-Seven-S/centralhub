// src/utils/errors.ts
// Custom error classes para distinguir errores de negocio de errores genéricos.

export class TotalUpfrontExceedsPriceError extends Error {
  readonly code = 'TOTAL_UPFRONT_EXCEEDS_PRICE' as const;

  constructor(
    public readonly totalUpfront: number,
    public readonly totalPrice: number,
  ) {
    super(`Total upfront (${totalUpfront}) excede precio del lote (${totalPrice})`);
    this.name = 'TotalUpfrontExceedsPriceError';
  }
}

export class UnsupportedInterestRateError extends Error {
  readonly code = 'UNSUPPORTED_INTEREST_RATE' as const;

  constructor(public readonly interestRate: number) {
    super(`Financiamiento con interés (${interestRate}%) aún no soportado — solo se admite interestRate = 0`);
    this.name = 'UnsupportedInterestRateError';
  }
}

export class InstallmentScheduleMismatchError extends Error {
  readonly code = 'INSTALLMENT_SCHEDULE_MISMATCH' as const;

  constructor(
    public readonly sum: number,
    public readonly financingAmount: number,
  ) {
    super(`La suma de cuotas (${sum}) no cuadra con el monto financiado (${financingAmount})`);
    this.name = 'InstallmentScheduleMismatchError';
  }
}

export type IneUploadErrorCode = 'INE_REQUIRED' | 'INVALID_FILE_TYPE' | 'FILE_TOO_LARGE';

export class IneUploadError extends Error {
  constructor(
    public readonly code: IneUploadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'IneUploadError';
  }
}
