import { describe, it, expect } from 'vitest';
import { leerHoja } from '../archivoMaestro';

// Encabezado estilo SANTANDER/PDS.
const H = ['PROYECTO','MANZANA','LOTE','SUPERFICIE','PRECIO M2','PRECIO/VENTA','CODIGO','CLIENTE','1er  PAGO','MENSUALIDAD','ESTATUS','NOTA'];
const vendido = ['SDR', 1, 1, 211.64, 1500, 317460, 'H011', 'Christian Marez', 'Octubre/25', 4957.66, 'Vendido', null];
const libre   = ['PDS', 3, 22, 229.77, 1550, 356144, null, null, null, null, null, 'DISPONIBLE'];
// Los cuadritos de resumen al pie de la hoja: la "manzana" es una etiqueta.
const resumen = [null, 'Total', 164, null, null, null, 'CANTIDAD DE LOTES POR MANZANA', null, null, null, null, null];

describe('leerHoja — inventario sin vender', () => {
  it('por omisión sigue devolviendo solo los lotes con código (no rompe a quien ya lo usa)', () => {
    const r = leerHoja([H, vendido, libre], 'SANTANDER', 'SAN');
    expect(r).toHaveLength(1);
    expect(r[0].codigo).toBe('H011');
  });

  it('con incluirSinCodigo devuelve también el inventario, con su m² y precio', () => {
    const r = leerHoja([H, vendido, libre], 'SANTANDER', 'SAN', { incluirSinCodigo: true });
    expect(r).toHaveLength(2);
    const inv = r.find(x => x.codigo === '')!;
    expect(inv).toMatchObject({ manzana: '3', lote: '22', m2: 229.77, precio: 356144 });
  });

  it('descarta los cuadros de resumen del pie: su manzana no es un número', () => {
    const r = leerHoja([H, vendido, resumen], 'JSA-2', 'JSA2', { incluirSinCodigo: true });
    expect(r.map(x => x.codigo)).toEqual(['H011']);
  });

  it('los descarta aunque se pidan solo los vendidos', () => {
    const r = leerHoja([H, resumen], 'JSA-2', 'JSA2');
    expect(r).toEqual([]);
  });

  it('una fila sin manzana o sin lote no es un lote', () => {
    const sinLote = ['PDS', 4, null, 200, 1500, 300000, null, null, null, null, null, null];
    expect(leerHoja([H, sinLote], 'PDS', 'PDS', { incluirSinCodigo: true })).toEqual([]);
  });
});

describe('leerHoja — columna DOBLE COMISION', () => {
  // MONARCA: además de COMISION hay una columna para la comisión doble que en
  // algunos lotes se le pagó al vendedor.
  const H2 = ['FECHA DE VENTA','NOMBRE  DE CLIENTE','MANZANA','LOTE',null,'CODIGO DE CLIENTE ASIGNADO','PLAZO (AÑOS)','NUMERO DE TELEFONO','1ER. PAGO','MENSUALIDAD','M2','PRECIO','COMISION','DOBLE COMISION'];
  const fila = (com: any, doble: any) =>
    [45700,'Ana',2,15,null,'F171',6,868,'MAYO',4000,250,300000,com,doble];

  it('lee las dos columnas por separado', () => {
    const r = leerHoja([H2, fila(14000, 14000)], 'MONARCA', 'MON1');
    expect(r[0].comision).toBe(14000);
    expect(r[0].comisionDoble).toBe(14000);
  });

  it('"DOBLE COMISION" NO se confunde con "COMISION"', () => {
    const r = leerHoja([H2, fila(14000, 9999)], 'MONARCA', 'MON1');
    expect(r[0].comision).toBe(14000);
    expect(r[0].comisionDoble).toBe(9999);
  });

  it('sin doble comisión queda en null, no en cero', () => {
    const r = leerHoja([H2, fila(14000, null)], 'MONARCA', 'MON1');
    expect(r[0].comisionDoble).toBeNull();
  });

  it('un lote puede traer doble sin comisión normal (caso K040)', () => {
    const r = leerHoja([H2, fila(null, 10000)], 'MONARCA', 'MON1');
    expect(r[0].comision).toBeNull();
    expect(r[0].comisionDoble).toBe(10000);
  });

  it('una hoja sin esa columna no rompe', () => {
    const H3 = ['FECHA DE VENTA','NOMBRE  DE CLIENTE','MANZANA','LOTE',null,'CODIGO DE CLIENTE ASIGNADO','PLAZO (AÑOS)','NUMERO DE TELEFONO','1ER. PAGO','MENSUALIDAD','M2','PRECIO','COMISION'];
    const r = leerHoja([H3, [45700,'Ana',2,15,null,'F171',6,868,'MAYO',4000,250,300000,14000]], 'X', 'X');
    expect(r[0].comision).toBe(14000);
    expect(r[0].comisionDoble).toBeNull();
  });
});

describe('leerHoja — cómo escribe cada hoja el nombre de la comisión', () => {
  const base = ['FECHA DE VENTA','PROYECTO','MZA','LOTE','CODIGO','CLIENTE ACTUAL','1er PAGO','MENSUALIDAD','SUPERFICIE M2','PRECIO POR LOTE'];
  const fila = (com: any, doble: any) => [45384,'VR',1,11,'V464','Ana','MAYO',6000,300,375000, com, doble];

  it('V.ROBLE escribe "COMICION" con C y "COMISIONDOBLE" sin espacio', () => {
    const H = [...base, 'COMICION ', 'COMISIONDOBLE'];
    const r = leerHoja([H, fila(15000, 15000)], 'V.ROBLE', 'VDR');
    expect(r[0].comision).toBe(15000);
    expect(r[0].comisionDoble).toBe(15000);
  });

  it('"COMISIONDOBLE" no se cuenta también como comisión normal', () => {
    const H = [...base, 'COMISIONDOBLE'];
    const r = leerHoja([H, [45384,'VR',1,11,'V464','Ana','MAYO',6000,300,375000, 15000]], 'V.ROBLE', 'VDR');
    expect(r[0].comision).toBeNull();
    expect(r[0].comisionDoble).toBe(15000);
  });

  it('MONARCA escribe "COMISION" y "DOBLE COMISION" separadas', () => {
    const H = [...base, 'COMISION', 'DOBLE COMISION'];
    const r = leerHoja([H, fila(14000, 9000)], 'MONARCA', 'MON1');
    expect(r[0].comision).toBe(14000);
    expect(r[0].comisionDoble).toBe(9000);
  });
});
