import { describe, it, expect } from 'vitest';
import { siguienteGlobalCode, numeroDeGlobalCode } from '../clientCode';

describe('numeroDeGlobalCode — lee el consecutivo de los formatos que conviven en la BD', () => {
  it('formato de la migración: CLI-0001', () => {
    expect(numeroDeGlobalCode('CLI-0001')).toBe(1);
    expect(numeroDeGlobalCode('CLI-1609')).toBe(1609);
  });

  it('formato del controlador: CLI-000001', () => {
    expect(numeroDeGlobalCode('CLI-000042')).toBe(42);
  });

  it('formato con prefijo de proyecto NO tiene consecutivo: CLI-MON2-K117', () => {
    // Es el que rompía todo: parseInt('MON2') daba NaN y el código salía
    // literal "CLI-000NaN", que ya existe en la BD y choca con el índice único.
    expect(numeroDeGlobalCode('CLI-MON2-K117')).toBeNull();
    expect(numeroDeGlobalCode('CLI-PDS-G049')).toBeNull();
  });

  it('el código basura que ya quedó en la BD tampoco cuenta', () => {
    expect(numeroDeGlobalCode('CLI-000NaN')).toBeNull();
  });

  it('cualquier cosa que no sea un código válido devuelve null, nunca NaN', () => {
    expect(numeroDeGlobalCode('')).toBeNull();
    expect(numeroDeGlobalCode('basura')).toBeNull();
  });
});

describe('siguienteGlobalCode — nunca produce NaN ni repite', () => {
  it('toma el MÁXIMO numérico, no el último creado', () => {
    // El bug original: ordenaba por createdAt y el más reciente era
    // CLI-MON2-K117, que no tiene número.
    expect(siguienteGlobalCode(['CLI-0001', 'CLI-1609', 'CLI-MON2-K117'])).toBe('CLI-001610');
  });

  it('ignora por completo los códigos con prefijo de proyecto', () => {
    expect(siguienteGlobalCode(['CLI-MON2-K117', 'CLI-PDS-G049'])).toBe('CLI-000001');
  });

  it('sin ningún cliente arranca en 1', () => {
    expect(siguienteGlobalCode([])).toBe('CLI-000001');
  });

  it('nunca devuelve un código que ya exista en la lista', () => {
    const existentes = ['CLI-0001', 'CLI-000002', 'CLI-000NaN', 'CLI-SAN-H203'];
    const nuevo = siguienteGlobalCode(existentes);
    expect(existentes).not.toContain(nuevo);
    expect(nuevo).not.toContain('NaN');
  });

  it('el resultado siempre tiene el formato de 6 dígitos', () => {
    expect(siguienteGlobalCode(['CLI-0009'])).toMatch(/^CLI-\d{6}$/);
  });
});
