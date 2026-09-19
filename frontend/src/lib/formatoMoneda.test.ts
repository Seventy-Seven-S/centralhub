import { describe, it, expect } from 'vitest';
import { soloNumero, formatearMientrasTeclea, cursorTrasFormatear, aNumero } from './formatoMoneda';

describe('soloNumero', () => {
  it('tira todo lo que no es dígito ni punto', () => {
    expect(soloNumero('$1,234.56')).toBe('1234.56');
    expect(soloNumero('abc12x3')).toBe('123');
  });
  it('descarta un segundo punto en vez de insertarlo', () => {
    expect(soloNumero('12.34.56')).toBe('12.34');
    expect(soloNumero('1.2.3')).toBe('1.23');
  });
  it('recorta a dos decimales', () => {
    expect(soloNumero('12.3456')).toBe('12.34');
  });
});

describe('formatearMientrasTeclea', () => {
  it('mete comas de millares conforme se teclea', () => {
    expect(formatearMientrasTeclea('1234')).toBe('$1,234');
    expect(formatearMientrasTeclea('250000')).toBe('$250,000');
    expect(formatearMientrasTeclea('1234567')).toBe('$1,234,567');
  });

  it('respeta los decimales a medio teclear sin completarlos', () => {
    expect(formatearMientrasTeclea('1234.')).toBe('$1,234.');
    expect(formatearMientrasTeclea('1234.5')).toBe('$1,234.5');
    expect(formatearMientrasTeclea('1234.56')).toBe('$1,234.56');
  });

  it('deja el campo vacío en vez de poner un cero pegado', () => {
    expect(formatearMientrasTeclea('')).toBe('');
  });

  it('tolera que empiece con punto', () => {
    expect(formatearMientrasTeclea('.5')).toBe('$0.5');
  });
});

describe('cursorTrasFormatear', () => {
  it('mantiene el cursor tras el mismo dígito aunque entren comas', () => {
    // "1234|" -> "$1,234|"  el cursor va tras 4 dígitos
    expect(cursorTrasFormatear('$1,234', 4)).toBe(6);
  });
  it('coloca el cursor al inicio del número, después del signo', () => {
    expect(cursorTrasFormatear('$1,234', 0)).toBe(1);
  });
  it('no se sale del texto', () => {
    expect(cursorTrasFormatear('$1,234', 99)).toBe(6);
  });
});

describe('aNumero', () => {
  it('lee el valor real detrás del formato', () => {
    expect(aNumero('$1,234.56')).toBe(1234.56);
    expect(aNumero('')).toBe(0);
    expect(aNumero('$0')).toBe(0);
  });
});
