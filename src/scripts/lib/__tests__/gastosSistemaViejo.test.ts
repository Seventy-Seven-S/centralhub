import { describe, it, expect } from 'vitest';
import { leerGastosDeMatriz, categoriaDeColumnaGasto } from '../gastosSistemaViejo';

// Encabezado igual al real: la columna 3 viene SIN nombre y ahí el archivo
// guarda un ajuste negativo que no es un gasto.
const H = ['Concepto ', 'Fecha ', 'Caballero ', '', 'Central', 'Despacho ', 'Maquinaria', 'Planos, Trazo y Marcas', 'Sueldos', 'Varios '];
const F = (fecha: number | null, ...celdas: any[]) => ['concepto X', fecha, ...celdas];

describe('leerGastosDeMatriz', () => {
  it('lee un gasto simple con su categoría, fecha y monto', () => {
    const { gastos } = leerGastosDeMatriz([H, ['Topografia', 45866, null, null, null, null, null, 10000, null, null]]);
    expect(gastos).toHaveLength(1);
    expect(gastos[0]).toMatchObject({ concepto: 'Topografia', etiqueta: 'Planos, Trazo y Marcas', monto: 10000 });
    expect(gastos[0].fecha.toISOString().slice(0, 10)).toBe('2025-07-28');
  });

  it('una fila que toca dos categorías produce DOS gastos, no uno', () => {
    const { gastos } = leerGastosDeMatriz([H, ['Nora Caballero / Central', 45645, 210000, null, 90000, null, null, null, null, null]]);
    expect(gastos).toHaveLength(2);
    expect(gastos.map(g => g.monto).sort((a, b) => a - b)).toEqual([90000, 210000]);
    expect(new Set(gastos.map(g => g.etiqueta))).toEqual(new Set(['Caballero', 'Central']));
  });

  it('ignora la fila de TOTALES: no trae concepto', () => {
    const { gastos } = leerGastosDeMatriz([H, [null, null, 4353327, -345000, 1865690.14, null, null, null, null, null]]);
    expect(gastos).toEqual([]);
  });

  it('ignora los montos de columnas sin encabezado y los reporta', () => {
    const { gastos, sinColumna } = leerGastosDeMatriz([H, ['Ajuste al dinero dio Don Jose', null, null, -345000, null, null, null, null, null, null]]);
    expect(gastos).toEqual([]);
    expect(sinColumna).toHaveLength(1);
    expect(sinColumna[0]).toMatchObject({ concepto: 'Ajuste al dinero dio Don Jose', monto: -345000 });
  });

  it('un gasto sin fecha NO se carga: iría al periodo equivocado', () => {
    const { gastos, sinFecha } = leerGastosDeMatriz([H, ['Ajuste para que quede todo 70 - 30', null, null, null, null, null, null, null, null, 43550]]);
    expect(gastos).toEqual([]);
    expect(sinFecha).toHaveLength(1);
    expect(sinFecha[0]).toMatchObject({ concepto: 'Ajuste para que quede todo 70 - 30', monto: 43550 });
  });

  it('un concepto sin ningún monto se reporta, no se carga en cero', () => {
    const { gastos, sinMonto } = leerGastosDeMatriz([H, ['Total Play 50%', 46185, null, null, null, null, null, null, null, null]]);
    expect(gastos).toEqual([]);
    expect(sinMonto).toEqual(['Total Play 50%']);
  });

  it('un monto sin concepto se reporta: no se inventa una descripción', () => {
    const { gastos, sinConcepto } = leerGastosDeMatriz([H, [null, null, null, null, null, null, null, null, null, 350]]);
    expect(gastos).toEqual([]);
    expect(sinConcepto).toHaveLength(1);
    expect(sinConcepto[0].monto).toBe(350);
  });

  it('un cero no es un gasto', () => {
    const { gastos } = leerGastosDeMatriz([H, F(45866, null, null, 0, null, null, null, null, null)]);
    expect(gastos).toEqual([]);
  });
});

describe('categoriaDeColumnaGasto', () => {
  it('Caballero es el dueño del terreno de Santander', () => {
    expect(categoriaDeColumnaGasto('Caballero ')).toBe('Dueño del terreno');
  });
  it('planos y maquinaria caen en la categoría que agrupó el arquitecto', () => {
    expect(categoriaDeColumnaGasto('Planos, Trazo y Marcas')).toBe('Planos, Trazo y Maquinaria');
    expect(categoriaDeColumnaGasto('Planos, Trazo y Maquinaria')).toBe('Planos, Trazo y Maquinaria');
    expect(categoriaDeColumnaGasto('Maquinaria')).toBe('Planos, Trazo y Maquinaria');
  });
  it('"Oficina2" del archivo usa la categoría "Oficina 2" que ya existe', () => {
    expect(categoriaDeColumnaGasto('Oficina2')).toBe('Oficina 2');
  });
  it('las demás conservan su nombre', () => {
    expect(categoriaDeColumnaGasto('Administrativos')).toBe('Administrativos');
    expect(categoriaDeColumnaGasto('Central')).toBe('Central');
  });
});

import { faltantesContra } from '../gastosSistemaViejo';

describe('faltantesContra — idempotencia estable entre versiones del archivo', () => {
  const g = (fecha: string, monto: number, concepto = 'x', categoria = 'Central') =>
    ({ fecha: new Date(`${fecha}T00:00:00.000Z`), monto, concepto, categoria, etiqueta: categoria });

  it('no vuelve a cargar un gasto que ya está, aunque el archivo nuevo lo describa distinto', () => {
    const enBase = [{ date: new Date('2025-06-27T00:00:00.000Z'), amount: 43550 }];
    const delArchivo = [g('2025-06-27', 43550, 'Central')];
    expect(faltantesContra(delArchivo, enBase)).toEqual([]);
  });

  it('tampoco si el archivo nuevo lo reclasificó a otra categoría', () => {
    const enBase = [{ date: new Date('2026-06-12T00:00:00.000Z'), amount: 350 }];
    const delArchivo = [g('2026-06-12', 350, 'Internet', 'Administrativos')];
    expect(faltantesContra(delArchivo, enBase)).toEqual([]);
  });

  it('dos gastos iguales el mismo día cuentan como dos, no como uno', () => {
    const enBase = [{ date: new Date('2026-09-04T00:00:00.000Z'), amount: 3000 }];
    const delArchivo = [g('2026-09-04', 3000), g('2026-09-04', 3000)];
    expect(faltantesContra(delArchivo, enBase)).toHaveLength(1);
  });

  it('detecta lo genuinamente nuevo', () => {
    const enBase = [{ date: new Date('2026-08-28T00:00:00.000Z'), amount: 3000 }];
    const delArchivo = [g('2026-08-28', 3000), g('2026-09-11', 3000)];
    const faltan = faltantesContra(delArchivo, enBase);
    expect(faltan).toHaveLength(1);
    expect(faltan[0].fecha.toISOString().slice(0, 10)).toBe('2026-09-11');
  });

  it('base vacía → todo falta', () => {
    expect(faltantesContra([g('2025-01-01', 100), g('2025-01-02', 200)], [])).toHaveLength(2);
  });
});
