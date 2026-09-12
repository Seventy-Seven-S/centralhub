import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Express resuelve por orden de declaración. Si "/:id" quedara antes que
 * "/recibos/fallidos", Express trataría "recibos" como un id de pago y la
 * pantalla de recibos fallidos devolvería 404 sin explicación.
 */
describe('payment.routes — orden de rutas', () => {
  const src = fs.readFileSync(path.join(__dirname, '../payment.routes.ts'), 'utf8');
  const pos = (frag: string) => src.indexOf(frag);

  it('las rutas específicas de recibos se declaran antes que "/:id"', () => {
    expect(pos("'/recibos/fallidos'")).toBeGreaterThan(0);
    expect(pos("'/recibos/:id/reenviar'")).toBeGreaterThan(0);
    expect(pos("'/recibos/fallidos'")).toBeLessThan(pos("'/:id'"));
    expect(pos("'/recibos/:id/reenviar'")).toBeLessThan(pos("'/:id'"));
  });

  it('ambas exigen rol ADMIN: son datos de operación, no de ventanilla', () => {
    const fallidos = src.slice(pos("'/recibos/fallidos'"), pos("'/recibos/fallidos'") + 90);
    const reenviar = src.slice(pos("'/recibos/:id/reenviar'"), pos("'/recibos/:id/reenviar'") + 90);
    expect(fallidos).toContain('soloAdmin');
    expect(reenviar).toContain('soloAdmin');
  });
});
