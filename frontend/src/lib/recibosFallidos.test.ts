import { describe, it, expect } from 'vitest';
import { correoValido, destinoParaReenvio, RESULTADO_REENVIO } from './recibosFallidos';

describe('correoValido', () => {
  it('acepta un correo normal, con espacios alrededor', () => {
    expect(correoValido('ana@gmail.com')).toBe(true);
    expect(correoValido('  ana@gmail.com ')).toBe(true);
  });

  it('rechaza lo obviamente mal capturado', () => {
    expect(correoValido('')).toBe(false);
    expect(correoValido('ana gmail.com')).toBe(false);
    expect(correoValido('ana@gmail')).toBe(false);
    expect(correoValido('ana @gmail.com')).toBe(false);
  });
});

describe('destinoParaReenvio', () => {
  it('sin cambios no manda correo: el backend reusa el guardado', () => {
    expect(destinoParaReenvio('ana@gmail.com', 'ana@gmail.com')).toBeUndefined();
    expect(destinoParaReenvio('ana@gmail.com', ' ana@gmail.com ')).toBeUndefined();
    expect(destinoParaReenvio('ana@gmail.com', '')).toBeUndefined();
  });

  it('si lo corrigieron, manda el nuevo recortado', () => {
    expect(destinoParaReenvio('ana@gmial.com', ' ana@gmail.com')).toBe('ana@gmail.com');
    expect(destinoParaReenvio(null, 'ana@gmail.com')).toBe('ana@gmail.com');
  });
});

describe('RESULTADO_REENVIO', () => {
  it('cubre los tres desenlaces que devuelve el backend', () => {
    expect(Object.keys(RESULTADO_REENVIO).sort()).toEqual(['ENVIADO', 'FALLO', 'SIN_CORREO']);
    expect(RESULTADO_REENVIO.ENVIADO.tono).toBe('ok');
    expect(RESULTADO_REENVIO.FALLO.tono).toBe('error');
  });
});
