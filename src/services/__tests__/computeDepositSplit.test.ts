import { describe, it, expect } from 'vitest';
import { computeDepositSplit } from '../contract.service';
import { TotalUpfrontExceedsPriceError } from '../../utils/errors';

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

describe('computeDepositSplit (pago separado semantic)', () => {
  it('test 1: reservationDeposit null + enganche → totalUpfront = enganche', () => {
    const r = computeDepositSplit([lot({ reservationDeposit: null })], 25000, 260000);
    expect(r.totalDeposit).toBe(0);
    expect(r.enganche).toBe(25000);
    expect(r.totalUpfront).toBe(25000);
    expect(r.depositSources).toEqual([]);
  });

  it('test 2: reservationDeposit 0 + enganche → totalUpfront = enganche', () => {
    const r = computeDepositSplit([lot({ reservationDeposit: 0 })], 25000, 260000);
    expect(r.totalDeposit).toBe(0);
    expect(r.enganche).toBe(25000);
    expect(r.totalUpfront).toBe(25000);
    expect(r.depositSources).toEqual([]);
  });

  it('test 3: un lote con depósito + enganche, suma < precio', () => {
    const reservedAt = new Date('2026-04-10');
    const r = computeDepositSplit(
      [lot({ reservationDeposit: 5000, manzana: 5, lotNumber: '12', reservedAt })],
      20000,
      260000,
    );
    expect(r.totalDeposit).toBe(5000);
    expect(r.enganche).toBe(20000);
    expect(r.totalUpfront).toBe(25000);
    expect(r.depositSources).toHaveLength(1);
    expect(r.depositSources[0]).toEqual({
      lotLabel: 'M5 L-12',
      amount: 5000,
      reservedAt,
    });
  });

  it('test 4: enganche al firmar = 0 (solo depósito cubre el upfront)', () => {
    const r = computeDepositSplit(
      [lot({ reservationDeposit: 25000, reservedAt: new Date('2026-04-10') })],
      0,
      260000,
    );
    expect(r.totalDeposit).toBe(25000);
    expect(r.enganche).toBe(0);
    expect(r.totalUpfront).toBe(25000);
    expect(r.depositSources).toHaveLength(1);
  });

  it('test 5: multi-lote, suma deposits + enganche < precio', () => {
    const r = computeDepositSplit(
      [
        lot({ reservationDeposit: 3000, manzana: 5, lotNumber: '12', reservedAt: new Date('2026-04-10') }),
        lot({ reservationDeposit: 2000, manzana: 5, lotNumber: '13', reservedAt: new Date('2026-04-15') }),
      ],
      20000,
      260000,
    );
    expect(r.totalDeposit).toBe(5000);
    expect(r.enganche).toBe(20000);
    expect(r.totalUpfront).toBe(25000);
    expect(r.depositSources).toHaveLength(2);
  });

  it('test 6: multi-lote mixto (algunos null/0, otros con depósito > 0)', () => {
    const r = computeDepositSplit(
      [
        lot({ reservationDeposit: null, manzana: 5, lotNumber: '12' }),
        lot({ reservationDeposit: 5000, manzana: 5, lotNumber: '13', reservedAt: new Date('2026-04-15') }),
        lot({ reservationDeposit: 0, manzana: 5, lotNumber: '14' }),
      ],
      20000,
      260000,
    );
    expect(r.totalDeposit).toBe(5000);
    expect(r.enganche).toBe(20000);
    expect(r.totalUpfront).toBe(25000);
    expect(r.depositSources).toHaveLength(1);
    expect(r.depositSources[0].lotLabel).toBe('M5 L-13');
  });

  it('test 7: totalUpfront > totalPrice → lanza TotalUpfrontExceedsPriceError', () => {
    // deposit 5000 + enganche 260000 = 265000 > price 260000
    expect(() =>
      computeDepositSplit(
        [lot({ reservationDeposit: 5000, reservedAt: new Date('2026-04-10') })],
        260000,
        260000,
      ),
    ).toThrow(TotalUpfrontExceedsPriceError);

    try {
      computeDepositSplit(
        [lot({ reservationDeposit: 5000, reservedAt: new Date('2026-04-10') })],
        260000,
        260000,
      );
    } catch (err) {
      expect(err).toBeInstanceOf(TotalUpfrontExceedsPriceError);
      const e = err as TotalUpfrontExceedsPriceError;
      expect(e.code).toBe('TOTAL_UPFRONT_EXCEEDS_PRICE');
      expect(e.totalUpfront).toBe(265000);
      expect(e.totalPrice).toBe(260000);
    }
  });

  it('test 8: decimal — deposit 3,333.33 + enganche 10,000, price 100,000 → totalUpfront 13,333.33 exact', () => {
    const r = computeDepositSplit(
      [lot({ reservationDeposit: 3333.33, reservedAt: new Date('2026-04-10') })],
      10000,
      100000,
    );
    expect(r.totalDeposit).toBe(3333.33);
    expect(r.enganche).toBe(10000);
    expect(r.totalUpfront).toBe(13333.33); // igualdad exacta, no toBeCloseTo
  });

  it('test 9: multi-lote decimal — 1,111.11 + 2,222.22 deposits + 10,000 enganche → totals exactos', () => {
    const r = computeDepositSplit(
      [
        lot({ reservationDeposit: 1111.11, manzana: 5, lotNumber: '12', reservedAt: new Date('2026-04-10') }),
        lot({ reservationDeposit: 2222.22, manzana: 5, lotNumber: '13', reservedAt: new Date('2026-04-15') }),
      ],
      10000,
      100000,
    );
    expect(r.totalDeposit).toBe(3333.33);
    expect(r.enganche).toBe(10000);
    expect(r.totalUpfront).toBe(13333.33);
  });
});
