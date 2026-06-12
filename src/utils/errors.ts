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
