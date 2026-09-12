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
