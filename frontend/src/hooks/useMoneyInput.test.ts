import { describe, it, expect } from 'vitest';
import { parseMoneyDigits, formatMoneyForDisplay } from './useMoneyInput';

describe('parseMoneyDigits — limpia lo que el usuario teclea mientras edita (sin formatear aún)', () => {
  it('deja pasar dígitos y un punto decimal', () => {
    expect(parseMoneyDigits('13400.50')).toBe('13400.50');
  });

  it('quita letras y símbolos que no sean dígito o punto', () => {
    expect(parseMoneyDigits('$13,400.50 MXN')).toBe('13400.50');
  });

  it('colapsa un segundo punto decimal (no dos puntos válidos)', () => {
    expect(parseMoneyDigits('13.400.50')).toBe('13.40050');
  });

  it('string vacío se queda vacío', () => {
    expect(parseMoneyDigits('')).toBe('');
  });
});

describe('formatMoneyForDisplay — formato mostrado al perder el foco (toLocaleString es-MX, no formatMoney de reciboHelpers)', () => {
  it('formatea con símbolo, coma de miles y 2 decimales', () => {
    expect(formatMoneyForDisplay(13400)).toBe('$13,400.00');
  });

  it('cero o negativo se muestra vacío (mismo criterio que el precedente de Anticipo: "sin cero pegado")', () => {
    expect(formatMoneyForDisplay(0)).toBe('');
    expect(formatMoneyForDisplay(-5)).toBe('');
  });

  it('conserva centavos exactos', () => {
    expect(formatMoneyForDisplay(1234.5)).toBe('$1,234.50');
  });
});
