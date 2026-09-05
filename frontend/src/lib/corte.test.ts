import { describe, it, expect } from 'vitest';
import { resumenReparto, validarCorte } from './corte';

const pagos = [
  { id: 'p1', amount: 4000, seleccionado: true },
  { id: 'p2', amount: 6000, seleccionado: true },
  { id: 'p3', amount: 5000, seleccionado: false },
];

describe('resumenReparto', () => {
  it('total = suma de los pagos seleccionados; el dueño recibe total − egresos capturados', () => {
    const r = resumenReparto(pagos, { central: '3000', planos: '500' });
    expect(r).toEqual({ totalIngresos: 10000, totalEgresos: 3500, entregadoDueno: 6500, seleccionados: 2 });
  });
  it('campos vacíos o no numéricos cuentan como 0', () => {
    expect(resumenReparto(pagos, { central: '', planos: 'abc' }).totalEgresos).toBe(0);
  });
});

describe('validarCorte', () => {
  it('requiere al menos un pago seleccionado', () => {
    expect(validarCorte({ pagos: pagos.map(p => ({ ...p, seleccionado: false })), egresos: {}, fecha: '2026-09-10' })).toBe('Selecciona al menos un pago');
  });
  it('los egresos no pueden exceder los ingresos ni ser negativos', () => {
    expect(validarCorte({ pagos, egresos: { central: '20000' }, fecha: '2026-09-10' })).toBe('Los egresos exceden el total de ingresos del corte');
    expect(validarCorte({ pagos, egresos: { central: '-5' }, fecha: '2026-09-10' })).toBe('Los egresos no pueden ser negativos');
  });
  it('requiere fecha', () => {
    expect(validarCorte({ pagos, egresos: {}, fecha: '' })).toBe('Indica la fecha del corte');
  });
  it('válido → null', () => {
    expect(validarCorte({ pagos, egresos: { central: '3000' }, fecha: '2026-09-10' })).toBeNull();
  });
});
