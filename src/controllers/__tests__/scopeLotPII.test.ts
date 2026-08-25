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
