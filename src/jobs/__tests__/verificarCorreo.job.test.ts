import { describe, it, expect, vi, beforeEach } from 'vitest';

// El job importa el servicio de notificaciones (y con él Prisma) y el logger;
// en las pruebas todo eso se sustituye: lo que importa es la decisión.
vi.mock('../../services/notification.service', () => ({ default: { createForAudiences: vi.fn() } }));
vi.mock('../../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('resend', () => ({ Resend: vi.fn() }));

import { verificarCorreo, diagnosticarCorreo, type ClienteCorreo } from '../verificarCorreo.job';
import { dominioDeRemitente, evaluarDominio } from '../../services/lib/saludCorreo';

const PROD = { NODE_ENV: 'production', RESEND_API_KEY: 're_x', EMAIL_FROM: 'Central <notificaciones@central.mx>' };

function cliente(over: Partial<{ send: unknown; list: unknown }> = {}) {
  const send = vi.fn().mockResolvedValue(over.send ?? { error: null });
  const list = vi.fn().mockResolvedValue(over.list ?? { data: { data: [{ name: 'central.mx', status: 'verified' }] }, error: null });
  const c: ClienteCorreo = { emails: { send }, domains: { list } };
  return { c, send, list, crear: vi.fn(() => c) };
}

describe('dominioDeRemitente', () => {
  it('saca el dominio con o sin nombre', () => {
    expect(dominioDeRemitente('a@Central.MX')).toBe('central.mx');
    expect(dominioDeRemitente('Central <notificaciones@central.mx>')).toBe('central.mx');
    expect(dominioDeRemitente('sin-arroba')).toBeNull();
    expect(dominioDeRemitente(undefined)).toBeNull();
  });
});

describe('evaluarDominio', () => {
  it('solo "verified" cuenta como listo', () => {
    expect(evaluarDominio([{ name: 'central.mx', status: 'verified' }], 'central.mx')).toEqual({ ok: true });
    expect(evaluarDominio([{ name: 'central.mx', status: 'failed' }], 'central.mx').ok).toBe(false);
    expect(evaluarDominio([], 'central.mx').ok).toBe(false);
  });
});

describe('diagnosticarCorreo', () => {
  it('con EMAIL_TRANSPORT=console en local no contacta a Resend', async () => {
    const { crear } = cliente();
    const r = await diagnosticarCorreo({ NODE_ENV: 'development', EMAIL_TRANSPORT: 'console', RESEND_API_KEY: 're_x' }, crear);
    expect(r.estado).toBe('OMITIDO');
    expect(crear).not.toHaveBeenCalled();
  });

  it('en producción ignora EMAIL_TRANSPORT=console: ahí el correo tiene que salir', async () => {
    const { crear } = cliente();
    const r = await diagnosticarCorreo({ ...PROD, EMAIL_TRANSPORT: 'console' }, crear);
    expect(r.estado).toBe('OK');
  });

  it('sin llave es falla', async () => {
    const r = await diagnosticarCorreo({ NODE_ENV: 'production', EMAIL_FROM: 'a@b.mx' }, cliente().crear);
    expect(r).toMatchObject({ estado: 'FALLA' });
  });

  it('sin EMAIL_HEALTHCHECK_TO consulta el dominio y no manda nada', async () => {
    const { crear, send, list } = cliente();
    const r = await diagnosticarCorreo(PROD, crear);
    expect(r).toEqual({ estado: 'OK', metodo: 'DOMINIO' });
    expect(list).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('dominio sin verificar es falla', async () => {
    const { crear } = cliente({ list: { data: { data: [{ name: 'central.mx', status: 'pending' }] }, error: null } });
    const r = await diagnosticarCorreo(PROD, crear);
    expect(r.estado).toBe('FALLA');
  });

  it('llave de solo envío: no se puede verificar, pero no es una falla', async () => {
    const { crear } = cliente({ list: { data: null, error: { name: 'restricted_api_key', message: 'restricted' } } });
    const r = await diagnosticarCorreo(PROD, crear);
    expect(r.estado).toBe('SIN_VERIFICAR');
  });

  it('con EMAIL_HEALTHCHECK_TO manda el correo de prueba a esa dirección', async () => {
    const { crear, send, list } = cliente();
    const r = await diagnosticarCorreo({ ...PROD, EMAIL_HEALTHCHECK_TO: ' admin@central.mx ' }, crear);
    expect(r).toEqual({ estado: 'OK', metodo: 'PRUEBA' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@central.mx', from: PROD.EMAIL_FROM }));
    expect(list).not.toHaveBeenCalled();
  });

  it('si Resend rechaza el de prueba o la red falla, es falla', async () => {
    const rechazo = cliente({ send: { error: { name: 'invalid_api_key', message: 'API key is invalid' } } });
    expect((await diagnosticarCorreo({ ...PROD, EMAIL_HEALTHCHECK_TO: 'a@b.mx' }, rechazo.crear)).estado).toBe('FALLA');

    const red = cliente();
    red.send.mockRejectedValue(new Error('ECONNRESET'));
    const r = await diagnosticarCorreo({ ...PROD, EMAIL_HEALTHCHECK_TO: 'a@b.mx' }, red.crear);
    expect(r).toMatchObject({ estado: 'FALLA' });
    expect((r as { motivo: string }).motivo).toContain('ECONNRESET');
  });
});

describe('verificarCorreo — a quién avisa', () => {
  beforeEach(() => vi.clearAllMocks());

  it('si falla, avisa en la app con el motivo', async () => {
    const notificar = vi.fn().mockResolvedValue(undefined);
    const { crear } = cliente({ list: { data: { data: [] }, error: null } });
    await verificarCorreo({ env: PROD, crearCliente: crear, notificar });
    expect(notificar).toHaveBeenCalledTimes(1);
    expect(notificar.mock.calls[0][0]).toContain('central.mx');
  });

  it('si funciona, en local o sin poder verificar, no avisa', async () => {
    const notificar = vi.fn();
    await verificarCorreo({ env: PROD, crearCliente: cliente().crear, notificar });
    await verificarCorreo({ env: { EMAIL_TRANSPORT: 'console' }, crearCliente: cliente().crear, notificar });
    await verificarCorreo({
      env: PROD,
      crearCliente: cliente({ list: { data: null, error: { name: 'restricted_api_key' } } }).crear,
      notificar,
    });
    expect(notificar).not.toHaveBeenCalled();
  });

  it('el aviso por defecto va solo a los ADMIN, con tipo SYSTEM', async () => {
    const { default: notificationService } = await import('../../services/notification.service');
    await verificarCorreo({ env: { NODE_ENV: 'production' }, crearCliente: cliente().crear });
    expect(notificationService.createForAudiences).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SYSTEM' }),
      ['ADMIN'],
    );
  });

  it('si ni la notificación se puede crear, no revienta el job', async () => {
    const notificar = vi.fn().mockRejectedValue(new Error('BD caída'));
    await expect(verificarCorreo({ env: { NODE_ENV: 'production' }, crearCliente: cliente().crear, notificar })).resolves.toMatchObject({ estado: 'FALLA' });
  });
});
