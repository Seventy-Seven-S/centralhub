import { describe, it, expect } from 'vitest';
import clientAuthRouter from '../clientAuth.routes';

function rutas() {
  return (clientAuthRouter as any).stack
    .filter((l: any) => l.route)
    .map((l: any) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
}

describe('clientAuth.routes — sin registro público', () => {
  it('ya no existe POST /register: la cuenta del portal nace con el contrato', () => {
    expect(rutas()).not.toContain('POST /register');
  });

  it('login, perfil y cambio de contraseña siguen ahí', () => {
    expect(rutas()).toEqual(expect.arrayContaining(['POST /login', 'GET /profile', 'POST /change-password']));
  });
});
