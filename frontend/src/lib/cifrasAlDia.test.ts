import { describe, it, expect, vi } from 'vitest';
import { cambiaCifras, alCambiarCifras, avisarCambioDeCifras } from './cifrasAlDia';

describe('cambiaCifras', () => {
  it('un guardado de dinero recarga las cifras', () => {
    expect(cambiaCifras('post', '/expenses')).toBe(true);
    expect(cambiaCifras('post', '/payments/installment')).toBe(true);
    expect(cambiaCifras('patch', '/contracts/abc/rescind')).toBe(true);
    expect(cambiaCifras('delete', '/expenses/abc')).toBe(true);
  });

  it('una consulta no recarga nada', () => {
    expect(cambiaCifras('get', '/projects')).toBe(false);
    expect(cambiaCifras(undefined, '/projects')).toBe(false);
  });

  it('las preferencias, la sesión y las notificaciones no mueven cifras', () => {
    expect(cambiaCifras('put', '/users/mis-preferencias')).toBe(false);
    expect(cambiaCifras('post', '/auth/refresh')).toBe(false);
    expect(cambiaCifras('patch', '/notifications/abc/read')).toBe(false);
  });
});

describe('avisarCambioDeCifras', () => {
  it('avisa a quien escucha y deja de avisar al desuscribirse', () => {
    const fn = vi.fn();
    const quitar = alCambiarCifras(fn);
    avisarCambioDeCifras('post', '/expenses');
    avisarCambioDeCifras('get', '/expenses');
    expect(fn).toHaveBeenCalledTimes(1);
    quitar();
    avisarCambioDeCifras('post', '/expenses');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
