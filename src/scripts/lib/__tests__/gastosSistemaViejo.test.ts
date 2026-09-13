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
  it('la columna YA combinada se unifica', () => {
    expect(categoriaDeColumnaGasto('Planos, Trazo y Marcas')).toBe('Planos, Trazo y Maquinaria');
    expect(categoriaDeColumnaGasto('Planos, Trazo y Maquinaria')).toBe('Planos, Trazo y Maquinaria');
  });
  it('si la hoja las separa, NO se fusionan: agrupar es decisión del negocio', () => {
    expect(categoriaDeColumnaGasto('Planos ')).toBe('Planos');
    expect(categoriaDeColumnaGasto('Maquinaria')).toBe('Maquinaria');
  });
  it('Oficina2 y Presidencia son lo mismo que Despacho para el negocio', () => {
    expect(categoriaDeColumnaGasto('Oficina2')).toBe('Despacho');
    expect(categoriaDeColumnaGasto('Oficina 2')).toBe('Despacho');
    expect(categoriaDeColumnaGasto('Presidencia ')).toBe('Despacho');
    expect(categoriaDeColumnaGasto('Despacho ')).toBe('Despacho');
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

describe('categoriaDeColumnaGasto — la columna del dueño cambia de nombre por proyecto', () => {
  it('el nombre del dueño se indica desde afuera y va a "Dueño del terreno"', () => {
    expect(categoriaDeColumnaGasto('Rogelio Guerra ', 'Rogelio Guerra')).toBe('Dueño del terreno');
  });
  it('sin indicarlo, ese nombre conserva su etiqueta en vez de perderse', () => {
    expect(categoriaDeColumnaGasto('Rogelio Guerra ')).toBe('Rogelio Guerra');
  });
  it('Caballero sigue funcionando sin necesidad de indicarlo', () => {
    expect(categoriaDeColumnaGasto('Caballero ')).toBe('Dueño del terreno');
  });
  it('indicar un dueño no altera las demás columnas', () => {
    expect(categoriaDeColumnaGasto('Central', 'Rogelio Guerra')).toBe('Central');
    expect(categoriaDeColumnaGasto('Asesores', 'Rogelio Guerra')).toBe('Asesores');
  });
});

describe('leerGastosDeMatriz — gastos sin fecha que igual hay que registrar', () => {
  const H2 = ['Concepto ', 'Fecha ', 'Central', 'Planos, Trazo y Maquinaria'];

  it('por omisión siguen quedando fuera', () => {
    const { gastos, sinFecha } = leerGastosDeMatriz([H2,
      ['Trazo', 45950, null, 11750], ['Trazo otra', null, null, 14000]]);
    expect(gastos).toHaveLength(1);
    expect(sinFecha).toHaveLength(1);
  });

  it('con fecharConAnterior heredan la fecha del renglón fechado de arriba y quedan marcados', () => {
    const { gastos, sinFecha } = leerGastosDeMatriz([H2,
      ['Trazo', 45950, null, 11750], ['Trazo otra', null, null, 14000]],
      null, { fecharConAnterior: true });
    expect(sinFecha).toHaveLength(0);
    expect(gastos).toHaveLength(2);
    expect(gastos[1].fecha.toISOString().slice(0, 10)).toBe(gastos[0].fecha.toISOString().slice(0, 10));
    expect(gastos[1].fechaProvisional).toBe(true);
    expect(gastos[0].fechaProvisional).toBe(false);
  });

  it('la fecha heredada es la del ÚLTIMO renglón fechado, no la del primero', () => {
    const { gastos } = leerGastosDeMatriz([H2,
      ['A', 45950, null, 100], ['B', 46073, null, 200], ['C', null, null, 300]],
      null, { fecharConAnterior: true });
    expect(gastos[2].fecha.getTime()).toBe(gastos[1].fecha.getTime());
  });

  it('si no hay ningún renglón fechado antes, no se inventa: se reporta', () => {
    const { gastos, sinFecha } = leerGastosDeMatriz([H2, ['Primero sin fecha', null, null, 500]],
      null, { fecharConAnterior: true });
    expect(gastos).toEqual([]);
    expect(sinFecha).toHaveLength(1);
  });
});

describe('leerGastosDeMatriz — hoja con el concepto en columna SIN encabezado', () => {
  // Valle del Roble: la columna del concepto no tiene título, va pegada a Fecha.
  const H3 = ['', '', 'Fecha ', 'Despacho ', 'Aldo '];
  const fila = (con: any, fecha: any, desp: any, aldo: any) => ['', con, fecha, desp, aldo];

  it('toma como concepto la columna inmediatamente a la izquierda de Fecha', () => {
    const { gastos } = leerGastosDeMatriz([H3, fila('PAGO DESPACHO', 45483, 250000, null)]);
    expect(gastos).toHaveLength(1);
    expect(gastos[0]).toMatchObject({ concepto: 'PAGO DESPACHO', etiqueta: 'Despacho', monto: 250000 });
  });

  it('esa columna sin encabezado NO se confunde con una categoría', () => {
    const { gastos, sinColumna } = leerGastosDeMatriz([H3, fila('PAGO DESPACHO', 45483, 250000, null)]);
    expect(gastos.map(g => g.etiqueta)).toEqual(['Despacho']);
    expect(sinColumna).toEqual([]);
  });

  it('sin concepto se reporta, como siempre', () => {
    const { gastos, sinConcepto } = leerGastosDeMatriz([H3, fila(null, 45483, null, 50000)]);
    expect(gastos).toEqual([]);
    expect(sinConcepto).toHaveLength(1);
  });

  it('con usarCategoriaComoConcepto sí se carga, usando el nombre de la categoría', () => {
    const { gastos, sinConcepto } = leerGastosDeMatriz([H3, fila(null, 45483, null, 50000)],
      null, { usarCategoriaComoConcepto: true });
    expect(sinConcepto).toEqual([]);
    expect(gastos).toHaveLength(1);
    expect(gastos[0]).toMatchObject({ concepto: 'Aldo', etiqueta: 'Aldo', conceptoDerivado: true });
  });

  it('un concepto real nunca se marca como derivado', () => {
    const { gastos } = leerGastosDeMatriz([H3, fila('PAGO DESPACHO', 45483, 250000, null)],
      null, { usarCategoriaComoConcepto: true });
    expect(gastos[0].conceptoDerivado).toBe(false);
  });

  it('si la hoja SÍ titula "Concepto", se usa esa y no la vecina de Fecha', () => {
    const H4 = ['Concepto ', 'Fecha ', 'Central'];
    const { gastos } = leerGastosDeMatriz([H4, ['Topografia', 45866, 10000]]);
    expect(gastos[0].concepto).toBe('Topografia');
  });
});
