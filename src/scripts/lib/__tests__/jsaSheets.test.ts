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

describe('readJSAPaymentSheet — layouts adicionales descubiertos en dry-run', () => {
  it('hoja de fecha con columnas corridas +1 (13 Noviembre 2025 JSA1)', () => {
    const r = readJSAPaymentSheet('13 Noviembre 2025', [
      ['texto pegado por error', '', '', '', '', '', ''],
      ['', '10/31/2025 10:31:46', 'C033', 'Mensualidad', 'Manzana 1 Lote 16 (NOVIEMBRE)', 'Adriana López Pérez ', '3550'],
    ]);
    expect(r.pagos).toEqual([{
      codigo: 'C033', fecha: '10/31/2025 10:31:46', tipo: 'Mensualidad',
      concepto: 'Manzana 1 Lote 16 (NOVIEMBRE)', monto: 3550,
    }]);
  });

  it('hoja Resumen que en realidad es hoja de fecha (Resumen Febrero 2022 JSA1)', () => {
    const r = readJSAPaymentSheet('Resumen Febrero 2022', [
      ['PAGOS ', '', '', 'CORTE ', '7 de Marzo del 2022 ', ''],
      ['3/1/2022 12:04:36', 'C017', 'Mensualidad', 'Mensualidad Manzana 1 Lote 10', '$4,000.00', 'Monserrat Hernandez'],
    ]);
    expect(r.pagos).toEqual([{
      codigo: 'C017', fecha: '3/1/2022 12:04:36', tipo: 'Mensualidad',
      concepto: 'Mensualidad Manzana 1 Lote 10', monto: 4000,
    }]);
  });

  it('layout código-primero con fecha en col 3 (Resumen Junio 2023 JSA1)', () => {
    const r = readJSAPaymentSheet('Resumen Junio 2023', [
      ['C053', 'Ana Maria Esquivel Nevarez', 'Mensualidad', '5/29/2023 12:54:14', 'Manzana 1 Lote 22 JUNIO', '$3,550.00'],
    ]);
    expect(r.pagos).toEqual([{
      codigo: 'C053', fecha: '5/29/2023 12:54:14', tipo: 'Mensualidad',
      concepto: 'Manzana 1 Lote 22 JUNIO', monto: 3550,
    }]);
  });

  it('fila FASTIDIO-like sin celda de tipo NO pasa por la vía numérica aunque tenga timestamp', () => {
    const r = readJSAPaymentSheet('Hoja rara', [
      ['', 'D073', '', '7/1/2024 10:00:00', '825000'],
    ]);
    expect(r.pagos).toEqual([]);
  });

  it('enganche con monto numérico conserva el tipo Enganche', () => {
    const r = readJSAPaymentSheet('Octubre 2023', [
      ['9/16/2023 12:41:52', 'D001', 'Enganche', 'Manzana 3 Lote 7', '50000', 'Jovita Ibarra '],
    ]);
    expect(r.pagos[0].tipo).toBe('Enganche');
  });
});

describe('readJSAPaymentSheet — columna de saldo tras el monto (Resumen Mayo 2 2023 JSA2)', () => {
  it('toma el monto y NO el saldo cuando ambos son numéricos', () => {
    const r = readJSAPaymentSheet('Resumen Mayo 2 2023', [
      ['A036', 'Porfiria Hernandez Morales ', 'Mensualidad', '5/4/2023 8:52:48', 'Manzana 2 Lote 18', '3700', '127533'],
    ]);
    expect(r.pagos).toEqual([{
      codigo: 'A036', fecha: '5/4/2023 8:52:48', tipo: 'Mensualidad',
      concepto: 'Manzana 2 Lote 18', monto: 3700,
    }]);
  });

  it('enganche numérico con deuda restante al final toma el enganche', () => {
    const r = readJSAPaymentSheet('Resumen Mayo 2 2023', [
      ['A097', 'Ludivina Alvarez Muñiz ', 'Enganche', '5/6/2023 8:48:18', 'Manzana 2 Lote 15', '46000', '184000'],
    ]);
    expect(r.pagos[0].monto).toBe(46000);
  });
});

describe('readJSAPaymentSheet — Resumen con monto numérico y tablas de estatus', () => {
  it('lee filas [código, nombre, concepto, monto-numérico] (RESUMEN JULIO 2022 JSA2)', () => {
    const r = readJSAPaymentSheet('RESUMEN JULIO 2022', [
      ['CORTE AL :', '7 July 2022', '', '', ''],
      ['A001', 'Viridiana Hernandez Andrade', 'Manzana 1 Lote 27', '4000', ''],
    ]);
    expect(r.family).toBe('RESUMEN');
    expect(r.pagos).toEqual([{
      codigo: 'A001', fecha: '2022-07-07', tipo: 'Mensualidad',
      concepto: 'Manzana 1 Lote 27', monto: 4000,
    }]);
  });

  it('NO parsea tablas de estatus acumulado con varias celdas de dinero (Resumen Julio 2022 JSA1)', () => {
    const r = readJSAPaymentSheet('Resumen Julio 2022', [
      ['C001', 'Lucia Gabriela Álvarez Cerón', '1', 'Al dia ', '$190,000.00', '$62,400.00', '$127,600.00'],
    ]);
    expect(r.pagos).toEqual([]);
  });

  it('no confunde el número de lotes (<100) con el monto', () => {
    const r = readJSAPaymentSheet('RESUMEN JULIO 2022', [
      ['A002', 'Jorge Paredes Leal ', 'Manzana 2 Lote 2 y 3 ', '8000', ''],
    ]);
    expect(r.pagos[0].monto).toBe(8000);
  });
});

describe('calcularAjusteHistorico', () => {
  it('genera ajuste tipo Enganche cuando el contrato no tiene enganche parseado', async () => {
    const { calcularAjusteHistorico } = await import('../jsaSheets');
    expect(calcularAjusteHistorico(150000, 104000, false)).toEqual({ monto: 46000, tipo: 'Enganche' });
  });

  it('genera ajuste tipo Otro cuando ya hay enganche parseado', async () => {
    const { calcularAjusteHistorico } = await import('../jsaSheets');
    expect(calcularAjusteHistorico(150000, 120000, true)).toEqual({ monto: 30000, tipo: 'Otro' });
  });

  it('sin delta relevante (≤ $1) no genera ajuste', async () => {
    const { calcularAjusteHistorico } = await import('../jsaSheets');
    expect(calcularAjusteHistorico(100000, 99999.5, false)).toBeNull();
  });

  it('delta negativo (parseado > Directorio) no genera ajuste', async () => {
    const { calcularAjusteHistorico } = await import('../jsaSheets');
    expect(calcularAjusteHistorico(100000, 125000, true)).toBeNull();
  });

  it('sin dato de Directorio no genera ajuste', async () => {
    const { calcularAjusteHistorico } = await import('../jsaSheets');
    expect(calcularAjusteHistorico(undefined, 5000, false)).toBeNull();
  });

  it('redondea el monto a centavos', async () => {
    const { calcularAjusteHistorico } = await import('../jsaSheets');
    expect(calcularAjusteHistorico(100000.339, 50000, true)).toEqual({ monto: 50000.34, tipo: 'Otro' });
  });
});
