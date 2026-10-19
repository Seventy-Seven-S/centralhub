import { describe, it, expect } from 'vitest';
import { validarContrasenaNueva, motivoEnlaceInvalido } from './accesoPortal';

describe('validarContrasenaNueva', () => {
  it('pide mínimo 8 caracteres', () => {
    expect(validarContrasenaNueva('corta', 'corta')).toMatch(/8 caracteres/);
  });
  it('pide que coincidan', () => {
    expect(validarContrasenaNueva('MiCasa2026', 'MiCasa2025')).toMatch(/no coinciden/);
  });
  it('acepta una válida', () => {
    expect(validarContrasenaNueva('MiCasa2026', 'MiCasa2026')).toBeNull();
  });
});

describe('motivoEnlaceInvalido', () => {
  const conCodigo = (codigo: unknown) => ({ response: { data: { codigo } } });
  it('lee el código del backend', () => {
    expect(motivoEnlaceInvalido(conCodigo('VENCIDO'))).toBe('VENCIDO');
    expect(motivoEnlaceInvalido(conCodigo('USADO'))).toBe('USADO');
    expect(motivoEnlaceInvalido(conCodigo('INVALIDO'))).toBe('INVALIDO');
    expect(motivoEnlaceInvalido(conCodigo('SUSPENDIDA'))).toBe('SUSPENDIDA');
  });
  it('otros errores dejan el formulario a la vista', () => {
    expect(motivoEnlaceInvalido(conCodigo('OTRO'))).toBeNull();
    expect(motivoEnlaceInvalido({ response: { status: 429, data: {} } })).toBeNull();
    expect(motivoEnlaceInvalido(new Error('red'))).toBeNull();
    expect(motivoEnlaceInvalido(undefined)).toBeNull();
  });
});
