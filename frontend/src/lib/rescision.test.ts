import { describe, it, expect } from 'vitest';
import { validarRescision, puedeRescindir } from './rescision';

describe('validarRescision', () => {
  it('motivo obligatorio (mínimo 5 caracteres)', () => {
    expect(validarRescision({ motivo: '  ', fecha: '2026-09-05', devolucion: '' })).toBe('Escribe el motivo de la rescisión');
    expect(validarRescision({ motivo: 'ok', fecha: '2026-09-05', devolucion: '' })).toBe('Escribe el motivo de la rescisión');
  });

  it('fecha obligatoria y no futura', () => {
    expect(validarRescision({ motivo: 'Cliente firmó cancelación', fecha: '', devolucion: '' })).toBe('Indica la fecha de rescisión');
    expect(validarRescision({ motivo: 'Cliente firmó cancelación', fecha: '2099-01-01', devolucion: '' })).toBe('La fecha no puede ser futura');
  });

  it('devolución opcional; si viene, número ≥ 0', () => {
    expect(validarRescision({ motivo: 'Cliente firmó cancelación', fecha: '2026-09-05', devolucion: '' })).toBeNull();
    expect(validarRescision({ motivo: 'Cliente firmó cancelación', fecha: '2026-09-05', devolucion: '1500' })).toBeNull();
    expect(validarRescision({ motivo: 'Cliente firmó cancelación', fecha: '2026-09-05', devolucion: '-5' })).toBe('La devolución debe ser un monto válido (0 o mayor)');
    expect(validarRescision({ motivo: 'Cliente firmó cancelación', fecha: '2026-09-05', devolucion: 'abc' })).toBe('La devolución debe ser un monto válido (0 o mayor)');
  });
});

describe('puedeRescindir', () => {
  it('solo contratos vigentes', () => {
    for (const s of ['DRAFT', 'SIGNED', 'ACTIVE', 'IN_MORA']) expect(puedeRescindir(s)).toBe(true);
    for (const s of ['COMPLETED', 'CANCELED', 'RESCISSION']) expect(puedeRescindir(s)).toBe(false);
  });
});
