import { describe, it, expect } from 'vitest';
import { computeDepositSplit } from '../contract.service';
import { DepositExceedsDownPaymentError } from '../../utils/errors';

// Helper para construir lots fixture mínimos
function lot(opts: {
  id?: string;
  reservationDeposit?: number | null;
  manzana?: number;
  lotNumber?: string;
  reservedAt?: Date | null;
} = {}) {
  return {
    id: opts.id ?? 'lot-' + Math.random().toString(36).slice(2, 8),
    reservationDeposit: opts.reservationDeposit ?? null,
    manzana: opts.manzana ?? 5,
    lotNumber: opts.lotNumber ?? '12',
    reservedAt: opts.reservedAt ?? null,
  };
}

describe('computeDepositSplit', () => {
  it('test 1: reservationDeposit null → totalDeposit 0, remaining = downPayment', () => {
    const result = computeDepositSplit([lot({ reservationDeposit: null })], 25000);
    expect(result.totalDeposit).toBe(0);
    expect(result.downPaymentRemaining).toBe(25000);
    expect(result.depositSources).toEqual([]);
  });

  it('test 2: reservationDeposit 0 → totalDeposit 0, remaining = downPayment', () => {
    const result = computeDepositSplit([lot({ reservationDeposit: 0 })], 25000);
    expect(result.totalDeposit).toBe(0);
    expect(result.downPaymentRemaining).toBe(25000);
    expect(result.depositSources).toEqual([]);
  });

  it('test 3: un lote con depósito < enganche', () => {
    const reservedAt = new Date('2026-04-10');
    const result = computeDepositSplit(
      [lot({ reservationDeposit: 5000, manzana: 5, lotNumber: '12', reservedAt })],
      25000,
    );
    expect(result.totalDeposit).toBe(5000);
    expect(result.downPaymentRemaining).toBe(20000);
    expect(result.depositSources).toHaveLength(1);
    expect(result.depositSources[0]).toEqual({
      lotLabel: 'M5 L-12',
      amount: 5000,
      reservedAt,
    });
  });

  it('test 4: un lote con depósito == enganche → remaining 0', () => {
    const result = computeDepositSplit(
      [lot({ reservationDeposit: 25000, reservedAt: new Date('2026-04-10') })],
      25000,
    );
    expect(result.totalDeposit).toBe(25000);
    expect(result.downPaymentRemaining).toBe(0);
    expect(result.depositSources).toHaveLength(1);
  });

  it('test 5: multi-lote, suma de depósitos < enganche', () => {
    const result = computeDepositSplit(
      [
        lot({ reservationDeposit: 3000, manzana: 5, lotNumber: '12', reservedAt: new Date('2026-04-10') }),
        lot({ reservationDeposit: 2000, manzana: 5, lotNumber: '13', reservedAt: new Date('2026-04-15') }),
      ],
      25000,
    );
    expect(result.totalDeposit).toBe(5000);
    expect(result.downPaymentRemaining).toBe(20000);
    expect(result.depositSources).toHaveLength(2);
  });

  it('test 6: multi-lote mixto (algunos null/0, otros con depósito > 0)', () => {
    const result = computeDepositSplit(
      [
        lot({ reservationDeposit: null, manzana: 5, lotNumber: '12' }),
        lot({ reservationDeposit: 5000, manzana: 5, lotNumber: '13', reservedAt: new Date('2026-04-15') }),
        lot({ reservationDeposit: 0, manzana: 5, lotNumber: '14' }),
      ],
      25000,
    );
    expect(result.totalDeposit).toBe(5000);
    expect(result.downPaymentRemaining).toBe(20000);
    expect(result.depositSources).toHaveLength(1);
    expect(result.depositSources[0].lotLabel).toBe('M5 L-13');
  });

  it('test 7: depósito > enganche → lanza DepositExceedsDownPaymentError', () => {
    expect(() =>
      computeDepositSplit([lot({ reservationDeposit: 30000, reservedAt: new Date('2026-04-10') })], 25000),
    ).toThrow(DepositExceedsDownPaymentError);

    try {
      computeDepositSplit([lot({ reservationDeposit: 30000, reservedAt: new Date('2026-04-10') })], 25000);
    } catch (err) {
      expect(err).toBeInstanceOf(DepositExceedsDownPaymentError);
      const e = err as DepositExceedsDownPaymentError;
      expect(e.code).toBe('DEPOSIT_EXCEEDS_DOWNPAYMENT');
      expect(e.totalDeposit).toBe(30000);
      expect(e.downPayment).toBe(25000);
    }
  });

  it('test 8: decimal — 3,333.33 + 10,000 → remaining exacto 6,666.67 (sin Float trash)', () => {
    const result = computeDepositSplit(
      [lot({ reservationDeposit: 3333.33, reservedAt: new Date('2026-04-10') })],
      10000,
    );
    expect(result.totalDeposit).toBe(3333.33);
    expect(result.downPaymentRemaining).toBe(6666.67); // igualdad exacta, no toBeCloseTo
  });

  it('test 9: multi-lote decimal — 1,111.11 + 2,222.22 + 10,000 → totals exactos', () => {
    const result = computeDepositSplit(
      [
        lot({ reservationDeposit: 1111.11, manzana: 5, lotNumber: '12', reservedAt: new Date('2026-04-10') }),
        lot({ reservationDeposit: 2222.22, manzana: 5, lotNumber: '13', reservedAt: new Date('2026-04-15') }),
      ],
      10000,
    );
    expect(result.totalDeposit).toBe(3333.33);
    expect(result.downPaymentRemaining).toBe(6666.67);
  });
});
