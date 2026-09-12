import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('user.routes — orden y permisos de /mis-preferencias', () => {
  const src = fs.readFileSync(path.join(__dirname, '../user.routes.ts'), 'utf8');
  const pos = (frag: string) => src.indexOf(frag);

  it('se declaran antes que "/:id": si no, Express trataría "mis-preferencias" como un id', () => {
    expect(pos("'/mis-preferencias'")).toBeGreaterThan(0);
    expect(pos("'/mis-preferencias'")).toBeLessThan(pos("'/:id'"));
  });

  it('PUT /mis-preferencias va antes que PUT /:id, que exige ADMIN', () => {
    const putPrefs = src.indexOf("router.put('/mis-preferencias'");
    const putId = src.indexOf("router.put('/:id'");
    expect(putPrefs).toBeGreaterThan(0);
    expect(putPrefs).toBeLessThan(putId);
  });

  it('NO exigen rol: son los ajustes del propio usuario, los usa cualquiera', () => {
    const bloque = src.slice(pos("'/mis-preferencias'"), pos("router.get('/sellers'"));
    expect(bloque).not.toContain('authorize(');
    expect(bloque).toContain('authenticate');
  });
});
