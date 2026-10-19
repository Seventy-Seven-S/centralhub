import { describe, it, expect } from 'vitest';
import clientAuthRouter from '../clientAuth.routes';
import clientRouter from '../client.routes';
import { authRateLimiter, authIpRateLimiter } from '../../middlewares/rateLimiter';

function capa(router: any, metodo: string, ruta: string) {
  return router.stack.find((l: any) => l.route?.path === ruta && l.route.methods[metodo]);
}

function pasa(router: any, metodo: string, ruta: string, role: string) {
  const handles = capa(router, metodo, ruta).route.stack.map((l: any) => l.handle);
  let nextCalled = false;
  try {
    handles[0]({ user: { role, userId: 'u-1' } } as any, {} as any, () => { nextCalled = true; });
    return nextCalled;
  } catch (err: any) {
    if (err.statusCode === 403) return false;
    throw err;
  }
}

describe('POST /client-auth/activar', () => {
  it('es pública pero lleva los mismos limitadores que el login', () => {
    const handles = capa(clientAuthRouter, 'post', '/activar').route.stack.map((l: any) => l.handle);
    expect(handles).toContain(authIpRateLimiter);
    expect(handles).toContain(authRateLimiter);
  });
});

describe('acceso al portal desde la ficha del cliente', () => {
  it.each([
    ['get', '/:id/portal-acceso'],
    ['post', '/:id/portal-acceso/reenviar'],
  ])('%s %s: ADMIN y MANAGER sí, AGENT y CLIENT no', (metodo, ruta) => {
    expect(pasa(clientRouter, metodo, ruta, 'ADMIN')).toBe(true);
    expect(pasa(clientRouter, metodo, ruta, 'MANAGER')).toBe(true);
    expect(pasa(clientRouter, metodo, ruta, 'AGENT')).toBe(false);
    expect(pasa(clientRouter, metodo, ruta, 'CLIENT')).toBe(false);
  });
});
