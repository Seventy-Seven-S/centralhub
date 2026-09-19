import { describe, it, expect } from 'vitest';
import { cambiosDelFormulario, validarFormulario, mesDeFecha } from './edicionContratoForm';

const actual = {
  totalPrice: 260000, installmentAmount: 4167, installmentCount: 62,
  startDate: '2025-09-05T00:00:00.000Z', lotIds: ['a'],
};

describe('mesDeFecha', () => {
  it('saca el mes de la primera cuota, que es el siguiente al ancla', () => {
    expect(mesDeFecha('2025-09-05T00:00:00.000Z')).toBe('2025-10');
  });
  it('tolera un contrato sin fecha de inicio', () => {
    expect(mesDeFecha(null)).toBe('');
  });
});

describe('cambiosDelFormulario', () => {
  it('manda solo lo que el ADMIN tocó', () => {
    const r = cambiosDelFormulario(actual, {
      totalPrice: '260,000', installmentAmount: '$3,473', installmentCount: '72',
      mesInicioCalendario: '2025-10', lotIds: ['a'],
    });
    expect(r).toEqual({ installmentAmount: 3473, installmentCount: 72 });
  });

  it('no manda nada si no cambió nada', () => {
    const r = cambiosDelFormulario(actual, {
      totalPrice: '260000', installmentAmount: '4167', installmentCount: '62',
      mesInicioCalendario: '2025-10', lotIds: ['a'],
    });
    expect(r).toEqual({});
  });

  it('detecta el cambio de lote', () => {
    const r = cambiosDelFormulario(actual, {
      totalPrice: '260000', installmentAmount: '4167', installmentCount: '62',
      mesInicioCalendario: '2025-10', lotIds: ['b'],
    });
    expect(r).toEqual({ lotIds: ['b'] });
  });
});

describe('validarFormulario', () => {
  const form = { totalPrice: '260000', installmentAmount: '3473', installmentCount: '72', mesInicioCalendario: '2025-10', lotIds: ['a'] };

  it('exige un motivo', () => {
    expect(validarFormulario(actual, form, '   ')).toMatch(/motivo/i);
  });

  it('exige que algo haya cambiado', () => {
    expect(validarFormulario(actual, { ...form, installmentAmount: '4167', installmentCount: '62' }, 'motivo suficientemente largo')).toMatch(/ning[úu]n cambio/i);
  });

  it('rechaza números que no son números', () => {
    expect(validarFormulario(actual, { ...form, totalPrice: 'abc' }, 'motivo válido')).toMatch(/precio/i);
  });

  it('acepta una corrección completa', () => {
    expect(validarFormulario(actual, form, 'El plazo real es de 72 meses')).toBeNull();
  });
});
