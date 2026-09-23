import { describe, it, expect } from 'vitest';
import { laSesionDeVerdadExpiro, esNoEncontrado } from './sesionExpirada';

const conStatus = (status: number) => ({ response: { status } });

describe('laSesionDeVerdadExpiro', () => {
  it('sí expiró cuando el servidor dice que el token no sirve', () => {
    expect(laSesionDeVerdadExpiro(conStatus(401))).toBe(true);
    expect(laSesionDeVerdadExpiro(conStatus(403))).toBe(true);
  });

  it('NO expiró cuando no hubo respuesta del servidor', () => {
    // Internet caído, o el backend reiniciándose por un despliegue. Sacar a la
    // secretaria aquí es lo que la estaba echando varias veces al día.
    expect(laSesionDeVerdadExpiro({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe(false);
    expect(laSesionDeVerdadExpiro(new Error('socket hang up'))).toBe(false);
    expect(laSesionDeVerdadExpiro({ response: undefined })).toBe(false);
  });

  it('NO expiró cuando el servidor falló por su cuenta', () => {
    for (const s of [500, 502, 503, 504]) {
      expect(laSesionDeVerdadExpiro(conStatus(s))).toBe(false);
    }
  });

  it('NO expiró cuando se agotó el tiempo de espera', () => {
    expect(laSesionDeVerdadExpiro({ code: 'ECONNABORTED', message: 'timeout of 0ms exceeded' })).toBe(false);
  });

  it('tampoco por una respuesta rara que no es de autenticación', () => {
    expect(laSesionDeVerdadExpiro(conStatus(404))).toBe(false);
    expect(laSesionDeVerdadExpiro(conStatus(400))).toBe(false);
  });
});

describe('esNoEncontrado', () => {
  it('solo es "no existe" si el servidor respondió 404', () => {
    expect(esNoEncontrado({ response: { status: 404 } })).toBe(true);
  });

  it('un fallo de red NO significa que el registro no exista', () => {
    // La pantalla decía "Cliente no encontrado" ante cualquier error, y la
    // secretaria concluía que el cliente se había borrado.
    expect(esNoEncontrado({ code: 'ERR_NETWORK' })).toBe(false);
    expect(esNoEncontrado({ response: { status: 500 } })).toBe(false);
    expect(esNoEncontrado({ response: { status: 401 } })).toBe(false);
    expect(esNoEncontrado(new Error('boom'))).toBe(false);
  });
});
