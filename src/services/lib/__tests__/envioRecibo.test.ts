import { describe, it, expect } from 'vitest';
import { decidirEstadoEnvio, resumirError } from '../envioRecibo';

describe('decidirEstadoEnvio', () => {
  it('sin correo del cliente → SIN_CORREO, no es un fallo', () => {
    expect(decidirEstadoEnvio(null, null)).toBe('SIN_CORREO');
    expect(decidirEstadoEnvio('', null)).toBe('SIN_CORREO');
    expect(decidirEstadoEnvio('   ', null)).toBe('SIN_CORREO');
  });

  it('con correo y sin error → ENVIADO', () => {
    expect(decidirEstadoEnvio('cliente@gmail.com', null)).toBe('ENVIADO');
  });

  it('con correo y con error → FALLO', () => {
    expect(decidirEstadoEnvio('cliente@gmail.com', new Error('boom'))).toBe('FALLO');
  });

  it('un error sin correo sigue siendo SIN_CORREO: nunca se intentó enviar', () => {
    expect(decidirEstadoEnvio('', new Error('boom'))).toBe('SIN_CORREO');
  });
});

describe('resumirError', () => {
  it('se queda con el mensaje', () => {
    expect(resumirError(new Error('domain is not verified'))).toBe('domain is not verified');
  });

  it('recorta los mensajes larguísimos: la columna no es un log', () => {
    const largo = 'x'.repeat(900);
    const r = resumirError(new Error(largo))!;
    expect(r.length).toBeLessThanOrEqual(500);
    expect(r.endsWith('…')).toBe(true);
  });

  it('sin error no hay nada que guardar', () => {
    expect(resumirError(null)).toBeNull();
  });

  it('algo que no es Error también se registra en vez de perderse', () => {
    expect(resumirError('se cayó la red')).toBe('se cayó la red');
    expect(resumirError({ code: 429 })).toContain('429');
  });
});
