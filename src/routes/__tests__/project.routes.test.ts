import { describe, it, expect } from 'vitest';
import projectRouter from '../project.routes';

function layer(method: 'get' | 'put' | 'post' | 'delete', path: string) {
  const l = (projectRouter as any).stack.find((x: any) => x.route?.path === path && x.route.methods[method]);
  if (!l) throw new Error(`No se encontró la ruta ${method.toUpperCase()} ${path}`);
  return l;
}

// stack[0] es authenticate; stack[1] es el authorize de la ruta.
function pasa(method: 'get' | 'put', path: string, role: string) {
  const handler = layer(method, path).route.stack[1].handle;
  let nextCalled = false;
  try {
    handler({ user: { role, userId: 'u-1' } } as any, {} as any, () => { nextCalled = true; });
    return nextCalled;
  } catch (err: any) {
    if (err.statusCode === 403) return false;
    throw err;
  }
}

describe('project.routes — lectura por rol', () => {
  it('GET / y GET /:id: los tres roles del equipo (tarjetas, selector y detalle)', () => {
    for (const path of ['/', '/:id']) {
      expect(pasa('get', path, 'ADMIN')).toBe(true);
      expect(pasa('get', path, 'MANAGER')).toBe(true);
      expect(pasa('get', path, 'AGENT')).toBe(true);
      expect(pasa('get', path, 'CLIENT')).toBe(false);
    }
  });

  it('GET /:id/reparto: solo ADMIN — ninguna pantalla se lo muestra a nadie más', () => {
    expect(pasa('get', '/:id/reparto', 'ADMIN')).toBe(true);
    expect(pasa('get', '/:id/reparto', 'MANAGER')).toBe(false);
    expect(pasa('get', '/:id/reparto', 'AGENT')).toBe(false);
  });

  it('PUT /:id/reparto sigue siendo solo ADMIN', () => {
    expect(pasa('put', '/:id/reparto', 'ADMIN')).toBe(true);
    expect(pasa('put', '/:id/reparto', 'MANAGER')).toBe(false);
  });
});
