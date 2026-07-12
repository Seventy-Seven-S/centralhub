import { describe, it, expect } from 'vitest';
import { nextContractCode } from '../contractCode';

describe('nextContractCode', () => {
  it('continúa la serie del prefijo dominante del proyecto', () => {
    expect(nextContractCode(['K001', 'K002', 'K107'], 'MON2')).toBe('K108');
  });

  it('usa el MÁXIMO numérico, no el último de la lista', () => {
    expect(nextContractCode(['K107', 'K002', 'K001'], 'MON2')).toBe('K108');
  });

  it('proyecto sin contratos → serie nueva con el código del proyecto como prefijo (no colisiona globalmente)', () => {
    expect(nextContractCode([], 'VSR')).toBe('VSR001');
  });

  it('ignora códigos que no siguen el patrón letra+número', () => {
    expect(nextContractCode(['A001', 'RESCINDIDO', 'A045'], 'JSA2')).toBe('A046');
  });

  it('con prefijos mixtos usa el más frecuente', () => {
    expect(nextContractCode(['V001', 'V002', 'V003', 'X001'], 'VDR')).toBe('V004');
  });

  it('conserva el padding de 3 dígitos', () => {
    expect(nextContractCode(['C009'], 'JSA1')).toBe('C010');
  });

  it('crece más allá de 999 sin romperse', () => {
    expect(nextContractCode(['V999'], 'VDR')).toBe('V1000');
  });
});
