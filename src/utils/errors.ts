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

// Firma binaria real (magic bytes) del archivo no coincide con ninguno de los
// tipos permitidos para ese endpoint, o no se pudo detectar (buffer vacío o
// corrupto). detectedMime es solo para logs de servidor — NUNCA exponerlo en
// el mensaje de error hacia el cliente (evita darle a un atacante señal de
// qué firma exacta detectamos/rechazamos).
export class InvalidFileSignatureError extends Error {
  readonly code = 'INVALID_FILE_SIGNATURE' as const;

  constructor(
    message: string,
    public readonly detectedMime: string | undefined,
  ) {
    super(message);
    this.name = 'InvalidFileSignatureError';
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
