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

// ── Consolidado 2026-09-09: SANTANDER, PUERTA DEL SOL y la columna 1er PAGO ──

import { parsePrimerPago, leerHoja as leerHoja2 } from '../archivoMaestro';

describe('parsePrimerPago — el mes en que arranca a pagar', () => {
  it('solo mes (V.ROBLE): usa el año de la fecha de venta', () => {
    expect(parsePrimerPago('MAYO', 2024)).toEqual({ mes: 5, anio: 2024 });
    expect(parsePrimerPago('DICIEMBRE', 2023)).toEqual({ mes: 12, anio: 2023 });
  });

  it('mes/año de dos dígitos (SANTANDER, PDS)', () => {
    expect(parsePrimerPago('Octubre/25', 2024)).toEqual({ mes: 10, anio: 2025 });
    expect(parsePrimerPago('Julio/26', 2024)).toEqual({ mes: 7, anio: 2026 });
  });

  it('tolera acentos, mayúsculas y espacios', () => {
    expect(parsePrimerPago(' febrero ', 2025)).toEqual({ mes: 2, anio: 2025 });
    expect(parsePrimerPago('DICIEMBRE/25', 2024)).toEqual({ mes: 12, anio: 2025 });
  });

  it('vacío o basura devuelve null en vez de inventar una fecha', () => {
    expect(parsePrimerPago(null, 2024)).toBeNull();
    expect(parsePrimerPago('', 2024)).toBeNull();
    expect(parsePrimerPago('-', 2024)).toBeNull();
    expect(parsePrimerPago('cualquier cosa', 2024)).toBeNull();
  });

  it('sin año de referencia y sin año en el texto, no adivina', () => {
    expect(parsePrimerPago('MAYO', null)).toBeNull();
  });
});

const HOJA_SAN = [
  ['SANTANDER'],
  [],
  ['PROYECTO', 'MANZANA', 'LOTE', 'SUPERFICIE', 'PRECIO M2', 'PRECIO/VENTA', 'CODIGO', 'CLIENTE', '1er  PAGO', 'MENSUALIDAD', 'ESTATUS', 'NOTA'],
  ['SDR', 1, 1, 211.64, 1500, 317460, 'H011', 'Christian Nataly', 'Octubre/25', 4957.66, 'Vendido', null],
  ['SDR', 1, 2, 200, 1300, 260000, 'H081', 'Klismen Horacio', 'Diciembre/25', 4166.66, 'Vendido', null],
];

describe('hoja estilo SANTANDER / PUERTA DEL SOL', () => {
  const filas = leerHoja2(HOJA_SAN as any, 'SANTANDER', 'SAN');

  it('toma PRECIO/VENTA y NO el precio por m² (bug fácil: ambas dicen PRECIO)', () => {
    expect(filas[0].precio).toBe(317460);
    expect(filas[1].precio).toBe(260000);
  });

  it('lee superficie, mensualidad y código', () => {
    expect(filas[0]).toMatchObject({ codigo: 'H011', m2: 211.64, mensualidad: 4957.66 });
  });

  it('lee el primer pago con su año', () => {
    expect(filas[0].primerPagoTexto).toBe('Octubre/25');
    expect(filas[1].primerPagoTexto).toBe('Diciembre/25');
  });
});

// ── Celdas de lote con varios lotes vendidos juntos ──────────────────────────
import { parseLotes } from '../archivoMaestro';

describe('parseLotes — "Se vendió como un solo lote"', () => {
  it('un lote suelto devuelve uno', () => {
    expect(parseLotes('19')).toEqual(['19']);
    expect(parseLotes('A-01')).toEqual(['A-01']);
  });

  it('separa "19 Y 20", que es como lo escriben en el archivo', () => {
    expect(parseLotes('19 Y 20')).toEqual(['19', '20']);
    expect(parseLotes('19 y 20')).toEqual(['19', '20']);
  });

  it('separa por coma: "18,19" y "20, 21"', () => {
    expect(parseLotes('18,19')).toEqual(['18', '19']);
    expect(parseLotes('20, 21')).toEqual(['20', '21']);
  });

  it('tolera el apóstrofo suelto que se cuela al capturar (M`15)', () => {
    expect(parseLotes('`23')).toEqual(['23']);
  });

  it('celda vacía no devuelve lotes fantasma', () => {
    expect(parseLotes(null)).toEqual([]);
    expect(parseLotes('')).toEqual([]);
    expect(parseLotes('  ')).toEqual([]);
  });

  it('el precio de una fila combinada es de TODOS sus lotes juntos, no de cada uno', () => {
    // El archivo pone el precio del conjunto en la fila; partirlo entre los
    // lotes inventaría precios que nadie firmó.
    const filas = leerHoja2([
      ['V.ROBLE'],
      ['PROYECTO', 'MZA', 'LOTE', 'CODIGO', 'CLIENTE ACTUAL', 'MENSUALIDAD', 'SUPERFICIE M2', 'PRECIO POR LOTE'],
      ['VR', 2, '19 Y 20', 'V104', 'AMAYRANI (Se vendio como un solo lote)', 6000, 400, 500000],
    ] as any, 'V.ROBLE', 'VDR');
    expect(filas).toHaveLength(1);
    expect(filas[0].lotes).toEqual(['19', '20']);
    expect(filas[0].precio).toBe(500000);
    expect(filas[0].vendidoJunto).toBe(true);
  });
});


describe('el apóstrofo que se cuela al capturar', () => {
  it('lo limpia también en MANZANA, no solo en LOTE', () => {
    // V379 está capturado como manzana "`15": sin limpiarlo, ese lote parecía
    // vendido y ausente del archivo cuando sí estaba.
    const filas = leerHoja2([
      ['V.ROBLE'],
      ['PROYECTO', 'MZA', 'LOTE', 'CODIGO', 'CLIENTE ACTUAL', 'MENSUALIDAD', 'SUPERFICIE M2', 'PRECIO POR LOTE'],
      ['VR2', '`15', '23', 'V379', 'BENJAMIN VAZQUEZ HERNANDEZ', 4000, 208.92, 250000],
    ] as any, 'V.ROBLE', 'VDR');
    expect(filas[0].manzana).toBe('15');
    expect(filas[0].lotes).toEqual(['23']);
  });
});

// ── Filas cuyo precio es el ACUMULADO y no el del lote ───────────────────────
describe('agruparPorCodigo — detecta el precio acumulado', () => {
  const hoja = (filas: any[][]) => leerHoja2([
    ['MONARCA'],
    ['FECHA', 'NOMBRE DE CLIENTE', 'MANZANA', 'LOTE', 'CODIGO DE CLIENTE', 'MENSUALIDAD', 'M2', 'PRECIO'],
    ...filas,
  ] as any, 'MONARCA', 'MON1');

  it('caso F108: mismos m² y misma mensualidad, pero un precio es el doble', () => {
    // La segunda fila trae el acumulado de las dos, no el precio de su lote.
    // Sumarlas daría $874,470 y le subiría $291,490 a una clienta que no debe.
    const g = agruparPorCodigo(hoja([
      [45831, 'Reyna Saenz', 7, '2', 'F108', 4524.83, 233.19, 291490],
      [45831, 'Reyna Saenz', 7, '3', 'F108', 4524.83, 233.19, 582980],
    ]));
    expect(g.get('MON1|F108')!.precioSospechoso).toBe(true);
  });

  it('caso H112: dos lotes iguales al mismo precio NO es sospechoso', () => {
    const g = agruparPorCodigo(hoja([
      [1, 'Jose Torres', 4, '8', 'H112', 3541.66, 200, 270000],
      [1, 'Jose Torres', 4, '23', 'H112', 3541.66, 200, 270000],
    ]));
    expect(g.get('MON1|H112')!.precioSospechoso).toBe(false);
    expect(g.get('MON1|H112')!.precioTotal).toBe(540000);
  });

  it('lotes de distinto tamaño con distinto precio tampoco es sospechoso', () => {
    const g = agruparPorCodigo(hoja([
      [1, 'Ana', 1, '1', 'Z001', 1000, 200, 250000],
      [1, 'Ana', 1, '2', 'Z001', 1000, 400, 500000],
    ]));
    expect(g.get('MON1|Z001')!.precioSospechoso).toBe(false);
  });

  it('un solo lote nunca es sospechoso', () => {
    const g = agruparPorCodigo(hoja([[1, 'Ana', 1, '1', 'Z002', 1000, 200, 250000]]));
    expect(g.get('MON1|Z002')!.precioSospechoso).toBe(false);
  });
});
