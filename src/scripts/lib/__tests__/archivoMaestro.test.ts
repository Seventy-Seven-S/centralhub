import { describe, it, expect } from 'vitest';
import { aNumero, encontrarEncabezado, leerHoja, agruparPorCodigo, alPesoMayor } from '../archivoMaestro';

describe('alPesoMayor — la regla del negocio: nadie paga con centavos en efectivo', () => {
  it('sube al peso siguiente', () => {
    expect(alPesoMayor(4570.15)).toBe(4571);
    expect(alPesoMayor(4687.50)).toBe(4688);
    expect(alPesoMayor(2604.17)).toBe(2605);
  });
  it('un entero se queda igual, no sube de más', () => {
    expect(alPesoMayor(5000)).toBe(5000);
    expect(alPesoMayor(3000.00)).toBe(3000);
  });
  it('no se deja engañar por el error de punto flotante', () => {
    // 0.1+0.2 = 0.30000000000000004 → sin el round2 previo daría 5001
    expect(alPesoMayor(5000 + 0.1 + 0.2 - 0.3)).toBe(5000);
  });
});

describe('aNumero — celdas sucias del Excel', () => {
  it('lee números y textos con formato de moneda', () => {
    expect(aNumero(4687.5)).toBe(4687.5);
    expect(aNumero('$4,687.50')).toBe(4687.5);
    expect(aNumero(' 3000 ')).toBe(3000);
  });
  it('vacíos y guiones son null, NUNCA 0 (un 0 se confundiría con mensualidad cero)', () => {
    expect(aNumero(null)).toBeNull();
    expect(aNumero('')).toBeNull();
    expect(aNumero('-')).toBeNull();
    expect(aNumero('—')).toBeNull();
  });
  it('texto no numérico es null, no NaN', () => {
    expect(aNumero('DE CONTADO')).toBeNull();
    expect(aNumero('ISASSI')).toBeNull();
  });
});

describe('encontrarEncabezado — cada hoja lo tiene en una fila distinta', () => {
  it('lo halla en la fila 0, 1 o 2', () => {
    expect(encontrarEncabezado([['CODIGO DE CLIENTE', 'PRECIO']])).toBe(0);
    expect(encontrarEncabezado([['MONARCA'], ['CODIGO DE CLIENTE']])).toBe(1);
    expect(encontrarEncabezado([[''], ['JARDINES'], ['x', 'CODIGO DE CLIENTE']])).toBe(2);
  });
  it('reconoce la hoja V.ROBLE, que titula la columna solo "CODIGO"', () => {
    expect(encontrarEncabezado([['PROYECTO', 'MZA', 'LOTE', 'CODIGO', 'CLIENTE ACTUAL', 'MENSUALIDAD']])).toBe(0);
  });

  it('devuelve -1 si la hoja no es de contratos', () => {
    expect(encontrarEncabezado([['otra', 'cosa']])).toBe(-1);
  });
});

const HOJA = [
  ['JSA-2'],
  ['FECHA', 'NOMBRE  DE CLIENTE', 'MANZANA', 'LOTE', 'CODIGO DE CLIENTE', 'PLAZO (AÑOS)', 'MENSUALIDAD', 'M2', 'PRECIO', 'OBSERVACIONES'],
  [44778, 'Edgar Rios', 3, '22', 'A046', 4, 4066.66, 274.34, 244000, null],
  [44779, 'Estela Morales', 4, '25', 'A047', 4, 4066.66, 274.34, 244000, null],
  [46118, 'Sergio Cano', 12, '4', 'J007', 'DE CONTADO', '-', 160, 332500, null],
  [46118, 'Sergio Cano', 12, '5', 'J007', 'DE CONTADO', '-', 160, 332500, null],
  [null, null, 1, '1', null, null, null, 498.98, 'ISASSI', null],
];

describe('leerHoja', () => {
  const filas = leerHoja(HOJA as any, 'JSA-2', 'JSA2');

  it('omite las filas sin código de cliente (lotes de Isassi, filas vacías)', () => {
    expect(filas).toHaveLength(4);
    expect(filas.map(f => f.codigo)).toEqual(['A046', 'A047', 'J007', 'J007']);
  });

  it('resuelve las columnas por nombre, no por posición', () => {
    const a046 = filas.find(f => f.codigo === 'A046')!;
    expect(a046.mensualidad).toBe(4066.66);
    expect(a046.precio).toBe(244000);
    expect(a046.m2).toBe(274.34);
    expect(a046.lote).toBe('22');
  });

  it('marca "DE CONTADO" y deja la mensualidad en null', () => {
    const j007 = filas.filter(f => f.codigo === 'J007');
    expect(j007.every(f => f.deContado)).toBe(true);
    expect(j007.every(f => f.mensualidad === null)).toBe(true);
  });
});

describe('agruparPorCodigo — un contrato puede tener varios lotes', () => {
  const g = agruparPorCodigo(leerHoja(HOJA as any, 'JSA-2', 'JSA2'));

  it('suma precio y m² de los lotes del mismo código', () => {
    const j007 = g.get('JSA2|J007')!;
    expect(j007.lotes).toBe(2);
    expect(j007.precioTotal).toBe(665000);
    expect(j007.m2Total).toBe(320);
  });

  it('la mensualidad del archivo es POR LOTE: la del contrato es la SUMA', () => {
    // Verificado contra producción: A071 tiene 5 lotes y su mensualidad en la
    // BD es 19,166.67 = 5 × 3,833.33, el valor que el archivo repite por fila.
    // Deduplicar en vez de sumar le bajaría la mensualidad al cliente 5 veces.
    const a046 = g.get('JSA2|A046')!;
    expect(a046.mensualidad).toBe(4066.66);   // 1 lote

    const cinco = leerHoja([
      ['x'],
      ['NOMBRE', 'CODIGO DE CLIENTE', 'MENSUALIDAD', 'PRECIO'],
      ...Array.from({ length: 5 }, () => ['Enrique', 'A071', 3833.33, 230000]),
    ] as any, 'X', 'JSA-2');
    expect(agruparPorCodigo(cinco).get('JSA-2|A071')!.mensualidad).toBeCloseTo(19166.65, 2);
  });

  it('suma aunque las filas traigan montos distintos entre sí', () => {
    const mixto = leerHoja([
      ['x'],
      ['NOMBRE', 'CODIGO DE CLIENTE', 'MENSUALIDAD', 'PRECIO'],
      ['Ana', 'Z001', 1000, 100000],
      ['Ana', 'Z001', 2000, 100000],
    ] as any, 'X', 'XX');
    expect(agruparPorCodigo(mixto).get('XX|Z001')!.mensualidad).toBe(3000);
  });

  it('filas sin mensualidad no cuentan como cero al sumar', () => {
    const conHueco = leerHoja([
      ['x'],
      ['NOMBRE', 'CODIGO DE CLIENTE', 'MENSUALIDAD', 'PRECIO'],
      ['Ana', 'Z002', 1000, 100000],
      ['Ana', 'Z002', null, 100000],
    ] as any, 'X', 'XX');
    const g2 = agruparPorCodigo(conHueco).get('XX|Z002')!;
    expect(g2.mensualidad).toBe(1000);
    expect(g2.lotesSinMensualidad).toBe(1);
  });

  it('separa códigos iguales de proyectos distintos', () => {
    const mezcla = [
      ...leerHoja(HOJA as any, 'JSA-2', 'JSA2'),
      ...leerHoja(HOJA as any, 'JSA-3', 'JSA3'),
    ];
    const g2 = agruparPorCodigo(mezcla);
    expect(g2.has('JSA2|A046')).toBe(true);
    expect(g2.has('JSA3|A046')).toBe(true);
  });
});
