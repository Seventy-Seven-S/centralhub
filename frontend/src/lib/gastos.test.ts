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

import { resumirGastosPorProyecto, filtrarPorProyecto } from './gastos';

const g2 = (projectId: string, code: string, name: string, amount: string) =>
  ({ projectId, project: { id: projectId, code, name }, amount });

describe('resumirGastosPorProyecto', () => {
  it('suma por proyecto y etiqueta con el código, que es como los nombra el equipo', () => {
    const r = resumirGastosPorProyecto([
      g2('p1', 'VDR', 'Valle del Roble', '5299000'),
      g2('p2', 'MON1', 'Monarca I', '2500000'),
      g2('p1', 'VDR', 'Valle del Roble', '1000'),
    ]);
    expect(r).toEqual([
      { clave: 'p1', etiqueta: 'VDR', cantidad: 2, monto: 5300000 },
      { clave: 'p2', etiqueta: 'MON1', cantidad: 1, monto: 2500000 },
    ]);
  });

  it('ordena por monto de mayor a menor', () => {
    const r = resumirGastosPorProyecto([
      g2('a', 'A', 'A', '10'), g2('b', 'B', 'B', '999'),
    ]);
    expect(r.map(x => x.etiqueta)).toEqual(['B', 'A']);
  });

  it('sin gastos → vacío', () => {
    expect(resumirGastosPorProyecto([])).toEqual([]);
  });

  it('un gasto sin proyecto cargado usa su id en vez de desaparecer del total', () => {
    const r = resumirGastosPorProyecto([{ projectId: 'p9', amount: '100' } as never]);
    expect(r[0]).toMatchObject({ clave: 'p9', monto: 100 });
  });
});

describe('filtrarPorProyecto', () => {
  const lista = [g2('p1', 'VDR', 'V', '1'), g2('p2', 'MON1', 'M', '2'), g2('p1', 'VDR', 'V', '3')];

  it('null = todos', () => {
    expect(filtrarPorProyecto(lista, null)).toHaveLength(3);
  });

  it('filtra al proyecto pedido', () => {
    expect(filtrarPorProyecto(lista, 'p1').map(x => x.amount)).toEqual(['1', '3']);
  });

  it('un proyecto sin gastos devuelve vacío', () => {
    expect(filtrarPorProyecto(lista, 'p9')).toEqual([]);
  });
});
