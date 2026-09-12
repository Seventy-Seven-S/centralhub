import { describe, it, expect } from 'vitest';
import { resumirGastosPorCategoria, filtrarPorCategoria } from './gastos';

const g = (categoryId: string, name: string, amount: string) =>
  ({ categoryId, category: { id: categoryId, name }, amount });

describe('resumirGastosPorCategoria', () => {
  it('suma por categoría aunque el monto venga como texto (Decimal de Prisma)', () => {
    const r = resumirGastosPorCategoria([
      g('c1', 'Central', '1000.50'), g('c1', 'Central', '0.50'), g('c2', 'Asesores', '250'),
    ]);
    expect(r).toEqual([
      { clave: 'c1', etiqueta: 'Central', cantidad: 2, monto: 1001 },
      { clave: 'c2', etiqueta: 'Asesores', cantidad: 1, monto: 250 },
    ]);
  });

  it('ordena por monto de mayor a menor', () => {
    const r = resumirGastosPorCategoria([
      g('c1', 'Varios', '10'), g('c1', 'Varios', '10'), g('c2', 'Dueño', '5000'),
    ]);
    expect(r.map(x => x.etiqueta)).toEqual(['Dueño', 'Varios']);
  });

  it('sin gastos → resumen vacío', () => {
    expect(resumirGastosPorCategoria([])).toEqual([]);
  });
});

describe('filtrarPorCategoria', () => {
  const lista = [g('c1', 'Central', '1'), g('c2', 'Asesores', '2'), g('c1', 'Central', '3')];

  it('null = todas', () => {
    expect(filtrarPorCategoria(lista, null)).toHaveLength(3);
  });

  it('filtra a la categoría pedida', () => {
    expect(filtrarPorCategoria(lista, 'c1').map(x => x.amount)).toEqual(['1', '3']);
  });

  it('una categoría sin gastos devuelve vacío, no la lista completa', () => {
    expect(filtrarPorCategoria(lista, 'c9')).toEqual([]);
  });

  it('devuelve los mismos objetos, sin copiar', () => {
    expect(filtrarPorCategoria(lista, 'c2')[0]).toBe(lista[1]);
  });
});
