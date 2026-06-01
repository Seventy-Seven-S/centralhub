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
