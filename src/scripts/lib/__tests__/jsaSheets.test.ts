import { describe, it, expect } from 'vitest';
import { readJSAPaymentSheet } from '../jsaSheets';

// Filas reales observadas en los Excel JSA (Actualizaciones/2026-06-30)

describe('readJSAPaymentSheet — hojas no-pago', () => {
  it('excluye hojas del set no-pago (Directorio, Capturas, etc.)', () => {
    const r = readJSAPaymentSheet('Directorio', [['x', 'C001', '$500.00']]);
    expect(r.family).toBe('NO_PAGO');
    expect(r.pagos).toEqual([]);
  });

  it('excluye hojas FASTIDIO por prefijo', () => {
    const r = readJSAPaymentSheet('FASTIDIO JULI0 2024', [
      ['', 'D073', '', '7/1/2024 10:00:00', '$825,000.00'],
    ]);
    expect(r.family).toBe('NO_PAGO');
    expect(r.pagos).toEqual([]);
  });
});

describe('readJSAPaymentSheet — hojas de fecha con $', () => {
  it('extrae pago con monto $ y toma el PRIMER $ (no el balance)', () => {
    const r = readJSAPaymentSheet('AGOSTO 2023', [
      ['6/21/2023 14:35:04', 'C061', 'Mensualidad', 'Manzana 3 Lote 22', '$3,542.00', 'e@x.com', 'Erika Gallardo', '$120,412.00'],
    ]);
    expect(r.family).toBe('FECHA_DOLAR');
    expect(r.pagos).toEqual([{
      codigo: 'C061', fecha: '6/21/2023 14:35:04', tipo: 'Mensualidad',
      concepto: 'Manzana 3 Lote 22', monto: 3542,
    }]);
  });

  it('ignora filas dummy (código X000) y filas sin código válido', () => {
    const r = readJSAPaymentSheet('AGOSTO 2023', [
      ['', '', 'RESUMEN', 'CORTE', '10 July 2023'],
      ['6/1/2023 10:00:00', 'C000', 'Mensualidad', 'x', '$100.00'],
      ['ENTREGADOS', '', '', '', ''],
    ]);
    expect(r.pagos).toEqual([]);
  });
});

describe('readJSAPaymentSheet — hojas de fecha con monto numérico (sin $)', () => {
  it('toma la última celda puramente numérica cuando monto va después del nombre', () => {
    const r = readJSAPaymentSheet('16 Febrero 2024', [
      ['1/15/2024 11:20:00', 'D041', 'Enganche', 'Manzana 4 Lote 5 y 6', 'José Francisco de la Fuente ', '100000'],
    ]);
    expect(r.family).toBe('FECHA_NUMERICA');
    expect(r.pagos).toEqual([{
      codigo: 'D041', fecha: '1/15/2024 11:20:00', tipo: 'Enganche',
      concepto: 'Manzana 4 Lote 5 y 6', monto: 100000,
    }]);
  });

  it('funciona cuando el monto va antes del nombre', () => {
    const r = readJSAPaymentSheet('Octubre 2023', [
      ['9/16/2023 12:41:52', 'D001', 'Enganche', 'Manzana 3 Lote 7', '50000', 'Jovita Ibarra '],
    ]);
    expect(r.pagos[0].monto).toBe(50000);
  });

  it('acepta montos numéricos con comas y decimales', () => {
    const r = readJSAPaymentSheet('X 2024', [
      ['1/15/2024 11:20:00', 'D041', 'Mensualidad', 'M1 L1', 'Nombre', '3,542.50'],
    ]);
    expect(r.pagos[0].monto).toBe(3542.5);
  });

  it('RECHAZA monto numérico si col 0 no es una fecha (guardia anti-FASTIDIO)', () => {
    const r = readJSAPaymentSheet('Hoja rara', [
      ['', 'D073', '', '7/1/2024 10:00:00', '825000'],
    ]);
    expect(r.pagos).toEqual([]);
    expect(r.family).toBe('DESCONOCIDA'); // tenía códigos pero nada recuperable → reportar
  });

  it('no confunde el concepto numérico corto (lote) con el monto: exige valor > 0 y toma la última', () => {
    const r = readJSAPaymentSheet('X 2024', [
      ['1/15/2024 11:20:00', 'D041', 'Mensualidad', '5', 'Nombre', '3600'],
    ]);
    expect(r.pagos[0].monto).toBe(3600);
  });
});

describe('readJSAPaymentSheet — hojas Resumen mensual (2022-2023)', () => {
  const resumenRows = [
    ['RESUMEN ', 'CORTE ', '7 February 2022', ''],
    ['ANTICIPOS ', '', '', ''],
    ['Enganches cobrados ', '$1,131,000.00', '', ''],
    ['MENSUALIDADES ', '', '', ''],
    ['Lucia Gabriela Álvarez Ceron', 'C001', '$3,200.00', ''],
    ['Sonia Andrade Garza', 'C005', 'Marzo ', ''],
    ['', '', '$84,330.00', ''],
  ];

  it('extrae pagos [nombre, código, monto$] con fecha del CORTE', () => {
    const r = readJSAPaymentSheet('Resumen Enero 2022', resumenRows);
    expect(r.family).toBe('RESUMEN');
    expect(r.pagos).toEqual([{
      codigo: 'C001', fecha: '2022-02-07', tipo: 'Mensualidad',
      concepto: 'Resumen Enero 2022', monto: 3200,
    }]);
  });

  it('ignora filas diferidas ("Marzo") y agregados sin código', () => {
    const r = readJSAPaymentSheet('Resumen Enero 2022', resumenRows);
    expect(r.pagos.map(p => p.codigo)).toEqual(['C001']);
  });

  it('sin fila CORTE, deriva la fecha del nombre de la hoja', () => {
    const r = readJSAPaymentSheet('Resumen Enero 2022', [
      ['Lucia Gabriela', 'C001', '$3,200.00'],
    ]);
    expect(r.pagos[0].fecha).toBe('2022-01-01');
  });

  it('maneja columnas corridas (código en col 2)', () => {
    const r = readJSAPaymentSheet('Abonos Julio 2022', [
      ['', 'RESUMEN ', 'CORTE ', '16 June 2022', ''],
      ['', 'Lucia Gabriela', 'C001', '$3,200.00', ''],
    ]);
    expect(r.pagos).toEqual([{
      codigo: 'C001', fecha: '2022-06-16', tipo: 'Mensualidad',
      concepto: 'Abonos Julio 2022', monto: 3200,
    }]);
  });

  it('trata "Abonos <mes> <año>" como Resumen', () => {
    const r = readJSAPaymentSheet('Abonos Agosto 2022', [
      ['Nombre', 'C010', '$5,000.00'],
    ]);
    expect(r.family).toBe('RESUMEN');
    expect(r.pagos[0].fecha).toBe('2022-08-01');
  });
});

describe('readJSAPaymentSheet — clasificación residual', () => {
  it('hoja sin códigos de cliente → VACIA (sin ruido)', () => {
    const r = readJSAPaymentSheet('Notas sueltas', [
      ['solo texto', '', ''],
      [],
    ]);
    expect(r.family).toBe('VACIA');
    expect(r.pagos).toEqual([]);
  });

  it('hoja con códigos pero sin montos recuperables → DESCONOCIDA', () => {
    const r = readJSAPaymentSheet('Hoja nueva rara', [
      ['algo', 'C001', 'texto', 'sin monto'],
    ]);
    expect(r.family).toBe('DESCONOCIDA');
    expect(r.pagos).toEqual([]);
  });
});

describe('reconciliarContrato', () => {
  it('OK cuando la diferencia es ≤ $1', async () => {
    const { reconciliarContrato } = await import('../jsaSheets');
    expect(reconciliarContrato(100000, 100000.5)).toEqual({ delta: -0.5, veredicto: 'OK' });
  });

  it('PARSEADO_MENOR cuando Directorio reporta más de lo parseado (hueco)', async () => {
    const { reconciliarContrato } = await import('../jsaSheets');
    expect(reconciliarContrato(440000, 118000)).toEqual({ delta: 322000, veredicto: 'PARSEADO_MENOR' });
  });

  it('PARSEADO_MAYOR cuando parseamos más que el Directorio (posible doble conteo)', async () => {
    const { reconciliarContrato } = await import('../jsaSheets');
    expect(reconciliarContrato(100000, 125000)).toEqual({ delta: -25000, veredicto: 'PARSEADO_MAYOR' });
  });

  it('SIN_DIRECTORIO cuando el contrato no aparece en Directorio', async () => {
    const { reconciliarContrato } = await import('../jsaSheets');
    expect(reconciliarContrato(undefined, 5000)).toEqual({ delta: null, veredicto: 'SIN_DIRECTORIO' });
  });
});
