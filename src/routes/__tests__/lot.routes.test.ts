import { describe, it, expect } from 'vitest';
import lotRouter from '../lot.routes';

// Introspecciona el router real (no una reproducción de authorize) — prueba
// la mecánica de autorización TAL COMO está cableada en la ruta real.
function findRouteLayer(method: 'post' | 'delete' | 'put' | 'get', path: string) {
  const layer = (lotRouter as any).stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method],
  );
  if (!layer) throw new Error(`No se encontró la ruta ${method.toUpperCase()} ${path}`);
  return layer;
}

// authorize() es síncrono: llama next() si pasa, hace throw si no. No usa next(err).
function tryFirstMiddleware(layer: any, user: { role: string; userId: string } | undefined) {
  const handler = layer.route.stack[0].handle;
  let nextCalled = false;
  try {
    handler({ user } as any, {} as any, () => { nextCalled = true; });
    return { threw: false, nextCalled };
  } catch (err: any) {
    return { threw: true, error: err };
  }
}

describe('lot.routes — POST /:id/reserve abierto a AGENT, resto sin cambios', () => {
  it('AGENT pasa el primer middleware de autorización de reserve (ya no 403)', () => {
    const layer = findRouteLayer('post', '/:id/reserve');
    const result = tryFirstMiddleware(layer, { role: 'AGENT', userId: 'agent-1' });

    expect(result.threw).toBe(false);
    expect(result.nextCalled).toBe(true);
  });

  it('ADMIN y MANAGER siguen pasando reserve (sin cambios)', () => {
    const layer = findRouteLayer('post', '/:id/reserve');

    expect(tryFirstMiddleware(layer, { role: 'ADMIN', userId: 'admin-1' }).threw).toBe(false);
    expect(tryFirstMiddleware(layer, { role: 'MANAGER', userId: 'mgr-1' }).threw).toBe(false);
  });

  it('VIEWER sigue sin poder ejecutar reserve (403)', () => {
    const layer = findRouteLayer('post', '/:id/reserve');
    const result = tryFirstMiddleware(layer, { role: 'VIEWER', userId: 'viewer-1' });

    expect(result.threw).toBe(true);
    expect(result.error.statusCode).toBe(403);
  });

  it('DELETE /:id/reserve (liberar apartado) NO se abrió — sigue solo ADMIN/MANAGER, AGENT sigue en 403', () => {
    const layer = findRouteLayer('delete', '/:id/reserve');
    const result = tryFirstMiddleware(layer, { role: 'AGENT', userId: 'agent-1' });

    expect(result.threw).toBe(true);
    expect(result.error.statusCode).toBe(403);
  });

  it('POST / (crear lote) y PUT /:id (editar) siguen sin abrirse a AGENT', () => {
    expect(tryFirstMiddleware(findRouteLayer('post', '/'), { role: 'AGENT', userId: 'agent-1' }).threw).toBe(true);
    expect(tryFirstMiddleware(findRouteLayer('put', '/:id'), { role: 'AGENT', userId: 'agent-1' }).threw).toBe(true);
  });
});
