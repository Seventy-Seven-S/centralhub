import { describe, it, expect } from 'vitest';
import {
  parseLoteNumbers,
  computePrice,
  deduceStatus,
  jsaConcentradoStatus,
  parseMoney,
} from '../lib/lots';

describe('parseLoteNumbers — multi-lote', () => {
  it('lote simple', () => {
    expect(parseLoteNumbers('5')).toEqual([5]);
  });

  it('"10 y 11" → [10, 11]', () => {
    expect(parseLoteNumbers('10 y 11')).toEqual([10, 11]);
  });

  it('"4,5,6,7" → [4, 5, 6, 7]', () => {
    expect(parseLoteNumbers('4,5,6,7')).toEqual([4, 5, 6, 7]);
  });

  it('"21-22-23" → [21, 22, 23] (lista explícita por guiones)', () => {
    expect(parseLoteNumbers('21-22-23')).toEqual([21, 22, 23]);
  });

  it('"21-24" → [21, 22, 23, 24] (rango ascendente de 2 extremos se expande)', () => {
    expect(parseLoteNumbers('21-24')).toEqual([21, 22, 23, 24]);
  });

  it('"3,4 y 5" → [3, 4, 5] (mezcla coma + y)', () => {
    expect(parseLoteNumbers('3,4 y 5')).toEqual([3, 4, 5]);
  });

  it('toma el primer número de tokens como "L3"', () => {
    expect(parseLoteNumbers('L3')).toEqual([3]);
  });

  it('de-duplica preservando orden', () => {
    expect(parseLoteNumbers('5, 5, 6')).toEqual([5, 6]);
  });

  it('vacío → []', () => {
    expect(parseLoteNumbers('')).toEqual([]);
    expect(parseLoteNumbers('   ')).toEqual([]);
  });
});

describe('computePrice — total vs precio/m²', () => {
  it('usa el precio total si está presente', () => {
    expect(computePrice({ superficie: 200, precio: 250000, precioM2: 1300 })).toBe(250000);
  });

  it('calcula Superficie_m2 × Precio_m2 cuando no hay total', () => {
    expect(computePrice({ superficie: 200, precioM2: 1300 })).toBe(260000);
  });

  it('redondea a 2 decimales', () => {
    expect(computePrice({ superficie: 212.57, precioM2: 1300 })).toBe(276341);
  });

  it('0 cuando no hay datos', () => {
    expect(computePrice({})).toBe(0);
    expect(computePrice({ superficie: 200 })).toBe(0);
  });
});

describe('parseMoney', () => {
  it('limpia formato "$210,000.00"', () => {
    expect(parseMoney('$210,000.00')).toBe(210000);
  });
  it('acepta number', () => {
    expect(parseMoney(1300)).toBe(1300);
  });
  it('vacío → 0', () => {
    expect(parseMoney('')).toBe(0);
    expect(parseMoney(undefined)).toBe(0);
  });
});

describe('deduceStatus — plantilla del becario', () => {
  it('"VENDIDO" explícito → SOLD', () => {
    expect(deduceStatus('VENDIDO', false)).toBe('SOLD');
  });
  it('"DISPONIBLE" explícito → AVAILABLE', () => {
    expect(deduceStatus('DISPONIBLE', true)).toBe('AVAILABLE');
  });
  it('"RESERVADO" explícito → RESERVED', () => {
    expect(deduceStatus('RESERVADO', false)).toBe('RESERVED');
  });
  it('vacío + empata contrato → SOLD', () => {
    expect(deduceStatus('', true)).toBe('SOLD');
  });
  it('vacío + sin contrato → AVAILABLE', () => {
    expect(deduceStatus('', false)).toBe('AVAILABLE');
  });
});

describe('jsaConcentradoStatus — Code/Estatus de Concentrado', () => {
  it('Code F (Finiquitado) → SOLD', () => {
    expect(jsaConcentradoStatus('F', 'Finiquitado', true)).toBe('SOLD');
  });
  it('Code P (Proceso de pago) → SOLD', () => {
    expect(jsaConcentradoStatus('P', 'Proceso de pago', true)).toBe('SOLD');
  });
  it('Code M (Morosidad) → SOLD', () => {
    expect(jsaConcentradoStatus('M', 'Morosidad', true)).toBe('SOLD');
  });
  it('Code R (Reserva) → RESERVED', () => {
    expect(jsaConcentradoStatus('R', 'Reserva con documentación', false)).toBe('RESERVED');
  });
  it('Code D (Dueños) → UNAVAILABLE', () => {
    expect(jsaConcentradoStatus('D', 'Dueños', false)).toBe('UNAVAILABLE');
  });
  it('sin code, con cliente → SOLD', () => {
    expect(jsaConcentradoStatus('', '', true)).toBe('SOLD');
  });
  it('sin code, sin cliente → AVAILABLE', () => {
    expect(jsaConcentradoStatus('', '', false)).toBe('AVAILABLE');
  });
});
