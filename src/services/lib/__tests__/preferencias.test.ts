import { describe, it, expect } from 'vitest';
import { fusionarPreferencias, leerOrdenProyectos } from '../preferencias';

describe('fusionarPreferencias', () => {
  it('agrega una clave sin borrar las que ya estaban', () => {
    expect(fusionarPreferencias({ tema: 'oscuro' }, { ordenProyectos: ['a'] }))
      .toEqual({ tema: 'oscuro', ordenProyectos: ['a'] });
  });

  it('sobrescribe solo la clave enviada', () => {
    expect(fusionarPreferencias({ ordenProyectos: ['a', 'b'] }, { ordenProyectos: ['b'] }))
      .toEqual({ ordenProyectos: ['b'] });
  });

  it('desde null arranca limpio', () => {
    expect(fusionarPreferencias(null, { ordenProyectos: ['a'] })).toEqual({ ordenProyectos: ['a'] });
  });

  it('un valor guardado que no es objeto no rompe: se reemplaza', () => {
    expect(fusionarPreferencias('basura' as any, { x: 1 })).toEqual({ x: 1 });
  });
});

describe('leerOrdenProyectos', () => {
  it('devuelve la lista de ids', () => {
    expect(leerOrdenProyectos({ ordenProyectos: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('sin preferencias devuelve vacío en vez de reventar', () => {
    expect(leerOrdenProyectos(null)).toEqual([]);
    expect(leerOrdenProyectos({})).toEqual([]);
  });

  it('descarta lo que no sea una lista de textos: viene de fuera', () => {
    expect(leerOrdenProyectos({ ordenProyectos: 'a,b' })).toEqual([]);
    expect(leerOrdenProyectos({ ordenProyectos: [1, 2] })).toEqual([]);
    expect(leerOrdenProyectos({ ordenProyectos: ['a', 5, 'b'] })).toEqual(['a', 'b']);
  });
});
