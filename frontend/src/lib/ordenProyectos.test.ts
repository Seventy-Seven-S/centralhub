import { describe, it, expect } from 'vitest';
import { aplicarOrden, mover } from './ordenProyectos';

const p = (id: string) => ({ id, name: id });

describe('aplicarOrden', () => {
  it('acomoda según el orden guardado', () => {
    expect(aplicarOrden([p('a'), p('b'), p('c')], ['c', 'a', 'b']).map(x => x.id))
      .toEqual(['c', 'a', 'b']);
  });

  it('sin orden guardado respeta el que viene del servidor', () => {
    expect(aplicarOrden([p('a'), p('b')], []).map(x => x.id)).toEqual(['a', 'b']);
    expect(aplicarOrden([p('a'), p('b')], null).map(x => x.id)).toEqual(['a', 'b']);
  });

  it('un proyecto NUEVO que no está en el orden guardado aparece al final, no se pierde', () => {
    expect(aplicarOrden([p('a'), p('b'), p('nuevo')], ['b', 'a']).map(x => x.id))
      .toEqual(['b', 'a', 'nuevo']);
  });

  it('un id guardado que ya no existe se ignora en vez de dejar un hueco', () => {
    expect(aplicarOrden([p('a'), p('b')], ['b', 'borrado', 'a']).map(x => x.id))
      .toEqual(['b', 'a']);
  });

  it('conserva el orden del servidor entre los nuevos', () => {
    expect(aplicarOrden([p('x'), p('y'), p('a')], ['a']).map(x => x.id)).toEqual(['a', 'x', 'y']);
  });

  it('no muta la lista original', () => {
    const lista = [p('a'), p('b')];
    aplicarOrden(lista, ['b', 'a']);
    expect(lista.map(x => x.id)).toEqual(['a', 'b']);
  });
});

describe('mover', () => {
  it('mueve un elemento hacia adelante', () => {
    expect(mover(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('mueve un elemento hacia atrás', () => {
    expect(mover(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('soltar en el mismo lugar no cambia nada', () => {
    expect(mover(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('índices fuera de rango devuelven la lista intacta', () => {
    expect(mover(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
    expect(mover(['a', 'b'], 0, 9)).toEqual(['a', 'b']);
    expect(mover(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
  });

  it('no muta la lista original', () => {
    const l = ['a', 'b', 'c'];
    mover(l, 0, 2);
    expect(l).toEqual(['a', 'b', 'c']);
  });
});
