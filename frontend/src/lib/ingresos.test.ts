import { describe, it, expect } from 'vitest';
import { resumirPorTipo, filtrarPorTipo, etiquetaTipo } from './ingresos';

const p = (paymentType: string, amount: number) => ({ paymentType, amount });

describe('resumirPorTipo', () => {
  it('agrupa por tipo con conteo y monto', () => {
    const r = resumirPorTipo([
      p('DOWN_PAYMENT', 20000), p('DOWN_PAYMENT', 15000), p('INSTALLMENT', 3000),
    ]);
    expect(r).toEqual([
      { tipo: 'DOWN_PAYMENT', etiqueta: 'Enganche', pagos: 2, monto: 35000 },
      { tipo: 'INSTALLMENT', etiqueta: 'Mensualidad', pagos: 1, monto: 3000 },
    ]);
  });

  it('ordena por monto de mayor a menor, no por cantidad de pagos', () => {
    const r = resumirPorTipo([
      p('INSTALLMENT', 100), p('INSTALLMENT', 100), p('INSTALLMENT', 100),
      p('DOWN_PAYMENT', 90000),
    ]);
    expect(r.map(x => x.tipo)).toEqual(['DOWN_PAYMENT', 'INSTALLMENT']);
  });

  it('no inventa tipos que no aparecen en la lista', () => {
    expect(resumirPorTipo([p('INSTALLMENT', 500)]).map(x => x.tipo)).toEqual(['INSTALLMENT']);
  });

  it('lista vacía → resumen vacío', () => {
    expect(resumirPorTipo([])).toEqual([]);
  });

  it('las devoluciones restan del total de su tipo, no se ignoran', () => {
    const r = resumirPorTipo([p('RESCISSION_REFUND', -5000), p('RESCISSION_REFUND', -1000)]);
    expect(r[0]).toEqual({ tipo: 'RESCISSION_REFUND', etiqueta: 'Devolución', pagos: 2, monto: -6000 });
  });

  it('un tipo desconocido se muestra con su clave, no se descarta', () => {
    const r = resumirPorTipo([p('TIPO_NUEVO', 100)]);
    expect(r).toEqual([{ tipo: 'TIPO_NUEVO', etiqueta: 'TIPO_NUEVO', pagos: 1, monto: 100 }]);
  });
});

describe('filtrarPorTipo', () => {
  const lista = [p('DOWN_PAYMENT', 1), p('INSTALLMENT', 2), p('DOWN_PAYMENT', 3)];

  it('null = todos los tipos', () => {
    expect(filtrarPorTipo(lista, null)).toHaveLength(3);
  });

  it('filtra al tipo pedido', () => {
    expect(filtrarPorTipo(lista, 'DOWN_PAYMENT').map(x => x.amount)).toEqual([1, 3]);
  });

  it('un tipo sin pagos devuelve vacío, no la lista completa', () => {
    expect(filtrarPorTipo(lista, 'ADJUSTMENT')).toEqual([]);
  });

  it('devuelve los mismos objetos, sin copiarlos ni reordenarlos', () => {
    expect(filtrarPorTipo(lista, 'INSTALLMENT')[0]).toBe(lista[1]);
  });
});

describe('etiquetaTipo', () => {
  it('traduce los tipos conocidos', () => {
    expect(etiquetaTipo('DOWN_PAYMENT')).toBe('Enganche');
    expect(etiquetaTipo('RESERVATION_DEPOSIT')).toBe('Apartado');
  });
  it('deja pasar el código cuando no lo conoce', () => {
    expect(etiquetaTipo('LO_QUE_SEA')).toBe('LO_QUE_SEA');
  });
});
