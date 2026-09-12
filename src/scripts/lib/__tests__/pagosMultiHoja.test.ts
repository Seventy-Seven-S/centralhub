import { describe, it, expect } from 'vitest';
import { extraerPagosDeFila } from '../pagosMultiHoja';

describe('extraerPagosDeFila', () => {
  it('reconoce un pago aunque las columnas cambien de lugar', () => {
    const a = extraerPagosDeFila([45156.38, 'B012', 'Enganche', 'Manzana 8 Lote 3', 36000, 'Néstor']);
    expect(a).toMatchObject({ cod: 'B012', monto: 36000, tipo: 'Enganche' });
    const b = extraerPagosDeFila([null, 45156.38, 'B012', 'Enganche', 'Manzana 8', 36000]);
    expect(b).toMatchObject({ cod: 'B012', monto: 36000 });
  });

  it('descarta los renglones de resumen: no traen código de cliente', () => {
    expect(extraerPagosDeFila([null, null, null, 'Total Entregado ', 39000])).toBeNull();
    expect(extraerPagosDeFila([null, null, null, 'Remanente Septiembre ', 9000, null])).toBeNull();
  });

  it('descarta encabezados y firmas', () => {
    expect(extraerPagosDeFila([null, 'CENTRAL INMOBILIARIA ', null, null])).toBeNull();
    expect(extraerPagosDeFila([null, null, null, 'NOMBRE Y FIRMA ', null])).toBeNull();
  });

  it('exige fecha: un renglón con código y monto pero sin fecha no es un pago fechado', () => {
    expect(extraerPagosDeFila([null, 'B012', 'Enganche', 'Manzana 8', 36000])).toBeNull();
  });

  it('un monto en cero no es un pago', () => {
    expect(extraerPagosDeFila([45156.38, 'B012', 'Enganche', 'Manzana 8', 0])).toBeNull();
  });

  it('acepta montos negativos: son los ajustes', () => {
    expect(extraerPagosDeFila([45156.38, 'B019', 'Mensualidad', 'Ajuste', -96000])).toMatchObject({ monto: -96000 });
  });

  it('el código puede traer espacios o venir en minúscula', () => {
    expect(extraerPagosDeFila([45156.38, ' b012 ', 'Enganche', 'x', 100])).toMatchObject({ cod: 'B012' });
  });

  it('no confunde un número de lote con un código de cliente', () => {
    expect(extraerPagosDeFila([45156.38, 'Manzana 8 Lote 3', 'Enganche', 'x', 100])).toBeNull();
  });

  it('toma el ÚLTIMO número como monto, no la fecha', () => {
    const r = extraerPagosDeFila([45156.38, 'B012', 'Mensualidad', 'Manzana 8 Lote 3', 3000]);
    expect(r!.monto).toBe(3000);
  });
});
