import { describe, it, expect } from 'vitest';
import { RANGOS, recortarSerie, rangosDisponibles } from './rangoIngresos';

const serie = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ periodo: `P${i}`, mes: `M${i}`, total: i }));

describe('recortarSerie', () => {
  it('se queda con los últimos N meses', () => {
    expect(recortarSerie(serie(24), 6).map(x => x.mes)).toEqual(['M18','M19','M20','M21','M22','M23']);
  });

  it('null = toda la historia', () => {
    expect(recortarSerie(serie(30), null)).toHaveLength(30);
  });

  it('si hay menos meses que el rango, devuelve los que hay sin rellenar', () => {
    expect(recortarSerie(serie(3), 12)).toHaveLength(3);
  });

  it('serie vacía no truena', () => {
    expect(recortarSerie([], 6)).toEqual([]);
  });

  it('no reordena ni copia los puntos', () => {
    const s = serie(10);
    expect(recortarSerie(s, 3)[0]).toBe(s[7]);
  });
});

describe('rangosDisponibles', () => {
  it('oculta los rangos más largos que la historia: no sirve ofrecer 24 meses si hay 8', () => {
    expect(rangosDisponibles(8).map(r => r.meses)).toEqual([6, null]);
  });

  it('con historia larga los ofrece todos', () => {
    expect(rangosDisponibles(40).map(r => r.meses)).toEqual([6, 12, 18, 24, null]);
  });

  it('"Todo" siempre está, aunque haya un solo mes', () => {
    expect(rangosDisponibles(1).map(r => r.meses)).toEqual([null]);
  });

  it('el rango se incluye cuando hay exactamente esos meses', () => {
    expect(rangosDisponibles(12).map(r => r.meses)).toEqual([6, 12, null]);
  });

  it('sin datos no ofrece nada', () => {
    expect(rangosDisponibles(0)).toEqual([]);
  });
});

describe('RANGOS', () => {
  it('las etiquetas están en español y dicen el periodo', () => {
    expect(RANGOS.map(r => r.etiqueta)).toEqual([
      '6 meses', '12 meses', '18 meses', '24 meses', 'Todo',
    ]);
  });
});
