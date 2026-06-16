import { describe, it, expect } from 'vitest';
import {
  buildCommissionData,
  DEFAULT_COMMISSION_RATE,
  BuildCommissionContractInput,
  BuildCommissionProjectInput,
} from '../commission.service';

function contract(
  opts: Partial<BuildCommissionContractInput> = {},
): BuildCommissionContractInput {
  return {
    id: opts.id ?? 'contract-1',
    agentId: opts.agentId ?? null,
    totalPrice: opts.totalPrice ?? 260000,
  };
}

function project(
  opts: Partial<BuildCommissionProjectInput> = {},
): BuildCommissionProjectInput {
  return {
    commissionValue: opts.commissionValue ?? null,
  };
}

describe('buildCommissionData', () => {
  it('sin agente (agentId null) → devuelve null, sin comisión', () => {
    const result = buildCommissionData(
      contract({ agentId: null }),
      project({ commissionValue: 5 }),
    );
    expect(result).toBeNull();
  });

  it('con agente y commissionValue=5 → percentage 5 y math correcta', () => {
    const result = buildCommissionData(
      contract({ id: 'c-9', agentId: 'agent-1', totalPrice: 260000 }),
      project({ commissionValue: 5 }),
    );
    expect(result).not.toBeNull();
    expect(result!.percentage).toBe(5);
    expect(result!.baseAmount).toBe(260000);
    expect(result!.commissionAmount).toBe(13000); // 260000 * 5 / 100
    expect(result!.contractId).toBe('c-9');
    expect(result!.agentId).toBe('agent-1');
    expect(result!.commissionType).toBe('SALE');
    expect(result!.status).toBe('PENDING');
  });

  it('con agente sin commissionValue → default 4 %', () => {
    const result = buildCommissionData(
      contract({ agentId: 'agent-2', totalPrice: 100000 }),
      project({ commissionValue: null }),
    );
    expect(result).not.toBeNull();
    expect(result!.percentage).toBe(DEFAULT_COMMISSION_RATE);
    expect(result!.percentage).toBe(4);
    expect(result!.commissionAmount).toBe(4000); // 100000 * 4 / 100
  });

  it('redondea commissionAmount a 2 decimales', () => {
    const result = buildCommissionData(
      contract({ agentId: 'agent-3', totalPrice: 333333.33 }),
      project({ commissionValue: 4 }),
    );
    // 333333.33 * 4 / 100 = 13333.3332 → 13333.33
    expect(result!.commissionAmount).toBe(13333.33);
  });
});
