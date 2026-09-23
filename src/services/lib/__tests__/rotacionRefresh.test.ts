import { describe, it, expect } from 'vitest';
import { decidirRotacion, GRACIA_ROTACION_MS } from '../rotacionRefresh';

const ahora = new Date('2026-09-23T12:00:00Z');
const haceSegundos = (s: number) => new Date(ahora.getTime() - s * 1000);

describe('decidirRotacion', () => {
  it('rechaza un token que no existe', () => {
    expect(decidirRotacion(null, ahora)).toEqual({ aceptar: false, motivo: 'inexistente' });
  });

  it('rechaza un token vencido', () => {
    const r = decidirRotacion({ expiresAt: haceSegundos(10), rotatedAt: null }, ahora);
    expect(r).toEqual({ aceptar: false, motivo: 'vencido' });
  });

  it('acepta y rota un token fresco', () => {
    const r = decidirRotacion({ expiresAt: new Date('2026-09-24T12:00:00Z'), rotatedAt: null }, ahora);
    expect(r).toEqual({ aceptar: true, rotar: true });
  });

  it('acepta un token ya rotado si fue hace muy poco', () => {
    // Dos pestañas abiertas renuevan casi a la vez: la segunda llega con el
    // token que la primera acaba de gastar. Antes eso la sacaba del sistema.
    const r = decidirRotacion(
      { expiresAt: new Date('2026-09-24T12:00:00Z'), rotatedAt: haceSegundos(5) },
      ahora,
    );
    expect(r).toEqual({ aceptar: true, rotar: false });
  });

  it('rechaza un token rotado hace rato', () => {
    const r = decidirRotacion(
      { expiresAt: new Date('2026-09-24T12:00:00Z'), rotatedAt: haceSegundos(GRACIA_ROTACION_MS / 1000 + 1) },
      ahora,
    );
    expect(r).toEqual({ aceptar: false, motivo: 'ya rotado' });
  });

  it('la gracia es corta: segundos, no minutos', () => {
    expect(GRACIA_ROTACION_MS).toBeGreaterThan(0);
    expect(GRACIA_ROTACION_MS).toBeLessThanOrEqual(60_000);
  });
});
