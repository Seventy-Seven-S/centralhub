import { describe, it, expect } from 'vitest';
import { scopeLotPII } from '../lot.controller';

function lot(over: Record<string, any> = {}) {
  return {
    id: 'lot-1',
    status: 'RESERVED',
    reservedByName: 'Juan Pérez',
    reservedByPhone: '8681234567',
    reservedByEmail: 'juan@example.com',
    reservedByAgentId: 'agent-A',
    ...over,
  };
}

describe('scopeLotPII — IDOR: el dato no viaja, no se oculta en la vista', () => {
  it('ADMIN ve todo — objeto idéntico al de entrada (misma forma, todos los campos)', () => {
    const input = lot();
    const result = scopeLotPII(input, 'ADMIN', 'admin-1');
    expect(result).toEqual(input);
  });

  it('MANAGER ve todo — objeto idéntico al de entrada', () => {
    const input = lot();
    const result = scopeLotPII(input, 'MANAGER', 'mgr-1');
    expect(result).toEqual(input);
  });

  it('AGENT viendo SU PROPIO apartado (reservedByAgentId === su userId) ve todo, sin filtrar', () => {
    const input = lot({ reservedByAgentId: 'agent-A' });
    const result = scopeLotPII(input, 'AGENT', 'agent-A');
    expect(result).toEqual(input);
  });

  it('AGENT viendo apartado AJENO: reservedByName/Phone/Email/AgentId son null — ausentes, no un placeholder', () => {
    const input = lot({ reservedByAgentId: 'agent-B' });
    const result = scopeLotPII(input, 'AGENT', 'agent-A');

    expect(result.reservedByName).toBeNull();
    expect(result.reservedByPhone).toBeNull();
    expect(result.reservedByEmail).toBeNull();
    expect(result.reservedByAgentId).toBeNull();
    // Confirma que no quedó ningún resto del dato original en el objeto:
    expect(JSON.stringify(result)).not.toContain('Juan Pérez');
    expect(JSON.stringify(result)).not.toContain('8681234567');
    expect(JSON.stringify(result)).not.toContain('juan@example.com');
    expect(JSON.stringify(result)).not.toContain('agent-B');
  });

  it('AGENT viendo apartado ajeno SÍ conserva el status del lote (para no ofrecerlo si ya no está disponible)', () => {
    const input = lot({ reservedByAgentId: 'agent-B', status: 'RESERVED' });
    const result = scopeLotPII(input, 'AGENT', 'agent-A');
    expect(result.status).toBe('RESERVED');
  });

  it('AGENT viendo un lote sin apartado (reservedByAgentId null) — nada que ocultar, campos ya null', () => {
    const input = lot({ reservedByAgentId: null, reservedByName: null, reservedByPhone: null, reservedByEmail: null, status: 'AVAILABLE' });
    const result = scopeLotPII(input, 'AGENT', 'agent-A');
    expect(result.reservedByName).toBeNull();
    expect(result.status).toBe('AVAILABLE');
  });

  it('rol sin caso especial (VIEWER, o ausente) → oculta por default, mismo que apartado ajeno', () => {
    const input = lot({ reservedByAgentId: 'agent-B' });
    const resultViewer = scopeLotPII(input, 'VIEWER', 'viewer-1');
    const resultNoRole = scopeLotPII(input, undefined, undefined);

    for (const result of [resultViewer, resultNoRole]) {
      expect(result.reservedByName).toBeNull();
      expect(result.reservedByPhone).toBeNull();
      expect(result.reservedByEmail).toBeNull();
      expect(result.reservedByAgentId).toBeNull();
    }
  });
});

describe('scopeLotPII — comprador y saldo del contrato vigente', () => {
  const vendido = (): any => lot({
    status: 'SOLD',
    reservedByName: null, reservedByPhone: null, reservedByEmail: null, reservedByAgentId: null,
    contracts: [{
      priceAtSale: 244000,
      contract: {
        id: 'c-9', contractNumber: 'JSA2-A013', codigoLegado: 'A013', status: 'IN_MORA',
        balance: 33797, clientId: 'cl-1', notes: 'Paga los viernes, tel 8689998877',
        client: { id: 'cl-1', firstName: 'Karina', lastName: 'Rodriguez', email: 'karina@gmail.com', phone: '8681112233' },
      },
    }],
  });

  it('ADMIN y MANAGER reciben el contrato completo', () => {
    expect(scopeLotPII(vendido(), 'ADMIN', 'a')).toEqual(vendido());
    expect(scopeLotPII(vendido(), 'MANAGER', 'm')).toEqual(vendido());
  });

  it('AGENT: sabe que está vendido (código, precio, estado) pero sin comprador ni saldo', () => {
    const r: any = scopeLotPII(vendido(), 'AGENT', 'agent-A');
    expect(r.contracts).toEqual([{
      priceAtSale: 244000,
      contract: { id: 'c-9', contractNumber: 'JSA2-A013', codigoLegado: 'A013', status: 'IN_MORA', client: null, balance: null },
    }]);
    const json = JSON.stringify(r);
    for (const dato of ['Karina', 'karina@gmail.com', '8681112233', '33797', 'cl-1', '8689998877']) {
      expect(json).not.toContain(dato);
    }
  });

  it('AGENT con su propio apartado conserva el contacto del apartado, pero tampoco ve compradores de contratos', () => {
    const input: any = lot({ reservedByAgentId: 'agent-A', contracts: vendido().contracts });
    const r: any = scopeLotPII(input, 'AGENT', 'agent-A');
    expect(r.reservedByName).toBe('Juan Pérez');
    expect((r.contracts as any)[0].contract.client).toBeNull();
    expect((r.contracts as any)[0].contract.balance).toBeNull();
  });
});
