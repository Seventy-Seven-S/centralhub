import { describe, it, expect } from 'vitest';
import { buildCommissionData } from '../commission.service';

// Nueva semántica: "asignación de vendedor + comisión manual".
// El % de comisión se teclea manualmente por venta y el monto se calcula
// sobre el precio del contrato (baseAmount * percentage / 100).
describe('buildCommissionData', () => {
  it('sin agente (agentId null) → devuelve null, sin comisión', () => {
    const result = buildCommissionData({
      contractId: 'c-1',
      agentId: null,
      percentage: 5,
      baseAmount: 260000,
    });
    expect(result).toBeNull();
  });

  it('sin agente (agentId undefined) → devuelve null', () => {
    const result = buildCommissionData({
      contractId: 'c-1',
      percentage: 5,
      baseAmount: 260000,
    });
    expect(result).toBeNull();
  });

  it('con agente y percentage=5 → percentage 5 y math correcta', () => {
    const result = buildCommissionData({
      contractId: 'c-9',
      agentId: 'agent-1',
      percentage: 5,
      baseAmount: 260000,
    });
    expect(result).not.toBeNull();
    expect(result!.percentage).toBe(5);
    expect(result!.baseAmount).toBe(260000);
    expect(result!.commissionAmount).toBe(13000); // 260000 * 5 / 100
    expect(result!.contractId).toBe('c-9');
    expect(result!.agentId).toBe('agent-1');
    expect(result!.commissionType).toBe('SALE');
    expect(result!.status).toBe('PENDING');
  });

  it('con agente pero percentage=0 → null (no hay comisión que capturar)', () => {
    const result = buildCommissionData({
      contractId: 'c-2',
      agentId: 'agent-2',
      percentage: 0,
      baseAmount: 100000,
    });
    expect(result).toBeNull();
  });

  it('con agente pero percentage negativo → null', () => {
    const result = buildCommissionData({
      contractId: 'c-3',
      agentId: 'agent-3',
      percentage: -2,
      baseAmount: 100000,
    });
    expect(result).toBeNull();
  });

  it('con agente pero percentage null/undefined → null', () => {
    expect(
      buildCommissionData({ contractId: 'c-4', agentId: 'agent-4', percentage: null, baseAmount: 100000 }),
    ).toBeNull();
    expect(
      buildCommissionData({ contractId: 'c-4', agentId: 'agent-4', baseAmount: 100000 }),
    ).toBeNull();
  });

  it('redondea commissionAmount a 2 decimales', () => {
    const result = buildCommissionData({
      contractId: 'c-5',
      agentId: 'agent-5',
      percentage: 4,
      baseAmount: 333333.33,
    });
    // 333333.33 * 4 / 100 = 13333.3332 → 13333.33
    expect(result!.commissionAmount).toBe(13333.33);
  });
});
