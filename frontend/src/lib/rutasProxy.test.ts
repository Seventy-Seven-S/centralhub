import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_ROUTES, PORTAL_ROUTES, PUBLIC_ROUTES, coincideRuta } from './rutasProxy';

function carpetasDe(grupo: string): string[] {
  const dir = path.resolve(__dirname, '../app', grupo);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => '/' + d.name)
    .sort();
}

describe('rutasProxy', () => {
  it('protege todas las carpetas de (admin)', () => {
    expect([...ADMIN_ROUTES].sort()).toEqual(carpetasDe('(admin)'));
  });

  it('protege todas las carpetas de (portal)', () => {
    expect([...PORTAL_ROUTES].sort()).toEqual(carpetasDe('(portal)'));
  });

  it('coincide por segmento completo', () => {
    expect(coincideRuta('/cortes', ADMIN_ROUTES)).toBe(true);
    expect(coincideRuta('/contratos/abc/editar', ADMIN_ROUTES)).toBe(true);
    expect(coincideRuta('/gastosx', ADMIN_ROUTES)).toBe(false);
    expect(coincideRuta('/portal/activar', PUBLIC_ROUTES)).toBe(true);
    expect(coincideRuta('/validar/123', PUBLIC_ROUTES)).toBe(true);
    expect(coincideRuta('/mi-cuenta', ADMIN_ROUTES)).toBe(false);
  });
});
