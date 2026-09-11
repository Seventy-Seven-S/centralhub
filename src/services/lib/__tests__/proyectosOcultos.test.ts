import { describe, it, expect } from 'vitest';
import {
  whereContratoVisible, wherePagoVisible, whereLoteVisible,
  whereProyectoVisible, whereGastoVisible, PROYECTO_OCULTO,
} from '../proyectosOcultos';

describe('proyectos ocultos — un solo punto de control', () => {
  it('sin proyecto elegido, EXCLUYE los ocultos de los totales', () => {
    // Es el caso que importa: el dashboard sumaba "todos los proyectos" y ahí
    // se colaban los $2.47M de Betania.
    expect(whereContratoVisible()).toEqual({ project: { status: { not: PROYECTO_OCULTO } } });
  });

  it('con proyecto elegido, filtra por ese proyecto', () => {
    expect(whereContratoVisible('p1')).toEqual({ projectId: 'p1' });
  });

  it('los pagos se filtran por el proyecto de SU contrato', () => {
    expect(wherePagoVisible()).toEqual({ contract: { project: { status: { not: PROYECTO_OCULTO } } } });
    expect(wherePagoVisible('p1')).toEqual({ contract: { projectId: 'p1' } });
  });

  it('lotes y gastos cuelgan directo del proyecto', () => {
    expect(whereLoteVisible()).toEqual({ project: { status: { not: PROYECTO_OCULTO } } });
    expect(whereGastoVisible()).toEqual({ project: { status: { not: PROYECTO_OCULTO } } });
    expect(whereLoteVisible('p1')).toEqual({ projectId: 'p1' });
  });

  it('el listado de proyectos no muestra los ocultos', () => {
    expect(whereProyectoVisible()).toEqual({ status: { not: PROYECTO_OCULTO } });
  });

  it('un ADMIN puede pedir verlos explícitamente', () => {
    // Ocultar no es borrar: los datos siguen ahí y un administrador debe poder
    // consultarlos si hace falta.
    expect(whereProyectoVisible(undefined, { incluirOcultos: true })).toEqual({});
    expect(whereContratoVisible(undefined, { incluirOcultos: true })).toEqual({});
    expect(wherePagoVisible(undefined, { incluirOcultos: true })).toEqual({});
  });

  it('elegir explícitamente un proyecto oculto sí lo muestra', () => {
    // Si alguien navega al proyecto oculto a propósito, no se le esconde su
    // propio contenido: lo que se evita es que se cuele en los agregados.
    expect(whereContratoVisible('bet-id')).toEqual({ projectId: 'bet-id' });
  });
});
