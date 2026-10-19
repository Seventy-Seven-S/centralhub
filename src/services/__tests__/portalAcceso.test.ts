import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const mocks = vi.hoisted(() => {
  const tx = {
    clientUser: { updateMany: vi.fn() },
    clientRefreshToken: { deleteMany: vi.fn() },
  };
  const prisma = {
    clientUser: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    client: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  };
  const bcrypt = { hash: vi.fn(async (v: string) => `bcrypt(${v})`) };
  const email = { sendPortalAccessEmail: vi.fn() };
  const bandera = { portal: true };
  return { prisma, tx, bcrypt, email, bandera };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));
vi.mock('bcrypt', () => ({ default: mocks.bcrypt }));
vi.mock('../../utils/portalClientes', () => ({
  get PORTAL_DE_CLIENTES_ACTIVO() { return mocks.bandera.portal; },
}));
vi.mock('../email.service', () => ({
  appUrl: () => 'https://app.example.com',
  sendPortalAccessEmail: mocks.email.sendPortalAccessEmail,
}));

import {
  generarTokenActivacion,
  hashTokenActivacion,
  urlActivacion,
  esContrasenaAdivinable,
  activarCuentaPortal,
  prepararCuentaPortalAlAlta,
  reenviarAccesoPortal,
  estadoAccesoPortal,
  VIGENCIA_ENLACE_MS,
} from '../portalAcceso.service';
import { EmailSendError } from '../../utils/errors';

const AHORA = new Date('2026-10-19T12:00:00Z');
const tokenDeUrl = (url: string) => new URL(url).searchParams.get('token')!;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bandera.portal = true;
  mocks.tx.clientUser.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.clientRefreshToken.deleteMany.mockResolvedValue({ count: 0 });
  mocks.prisma.clientUser.create.mockResolvedValue({});
  mocks.prisma.clientUser.update.mockResolvedValue({});
});

describe('token de activación', () => {
  it('es aleatorio, de 256 bits y en base64url (va en la URL sin escapar nada)', () => {
    const a = generarTokenActivacion(AHORA);
    const b = generarTokenActivacion(AHORA);
    expect(a.token).not.toBe(b.token);
    expect(Buffer.from(a.token, 'base64url')).toHaveLength(32);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('solo se guarda su SHA-256, nunca el token', () => {
    const { token, hash } = generarTokenActivacion(AHORA);
    expect(hash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(hash).not.toContain(token);
    expect(hashTokenActivacion(token)).toBe(hash);
  });

  it('vence a los 7 días', () => {
    const { expiresAt } = generarTokenActivacion(AHORA);
    expect(expiresAt.getTime() - AHORA.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(VIGENCIA_ENLACE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('la URL apunta a /portal/activar del frontend', () => {
    expect(urlActivacion('abc_-1')).toBe('https://app.example.com/portal/activar?token=abc_-1');
  });
});

describe('esContrasenaAdivinable — la fórmula vieja', () => {
  const cliente = { lastName: 'Pérez López', phone: '5551234567' };

  it('apellido[0:4] + teléfono[-4:] en minúsculas', () => {
    expect(esContrasenaAdivinable('pére4567', cliente)).toBe(true);
  });

  it('Central2024 siempre, con o sin datos', () => {
    expect(esContrasenaAdivinable('Central2024', cliente)).toBe(true);
    expect(esContrasenaAdivinable('Central2024', {})).toBe(true);
  });

  it('cliente sin apellido: solo el teléfono', () => {
    expect(esContrasenaAdivinable('4567', { lastName: null, phone: '5551234567' })).toBe(true);
  });

  it('una contraseña elegida por el cliente no cuenta', () => {
    expect(esContrasenaAdivinable('MiCasaVerde2026', cliente)).toBe(false);
    expect(esContrasenaAdivinable('PÉRE4567', cliente)).toBe(false);
  });

  it('sin apellido ni teléfono, la cadena vacía no se toma como contraseña vieja', () => {
    expect(esContrasenaAdivinable('', {})).toBe(false);
  });
});

describe('activarCuentaPortal', () => {
  const vigente = (extra: Record<string, unknown> = {}) => ({
    id: 'cu-1',
    status: 'INACTIVE',
    activationTokenExpiresAt: new Date(AHORA.getTime() + 60_000),
    activationTokenUsedAt: null,
    ...extra,
  });

  it('busca por el hash del token, no por el token', async () => {
    mocks.prisma.clientUser.findUnique.mockResolvedValue(vigente());
    await activarCuentaPortal('tok', 'nuevaClave1', AHORA);
    expect(mocks.prisma.clientUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activationTokenHash: hashTokenActivacion('tok') } }),
    );
  });

  it('guarda la contraseña con bcrypt, activa la cuenta, quema el enlace y cierra sesiones', async () => {
    mocks.prisma.clientUser.findUnique.mockResolvedValue(vigente());
    await activarCuentaPortal('tok', 'nuevaClave1', AHORA);

    expect(mocks.bcrypt.hash).toHaveBeenCalledWith('nuevaClave1', 10);
    expect(mocks.tx.clientUser.updateMany).toHaveBeenCalledWith({
      where: { id: 'cu-1', activationTokenHash: hashTokenActivacion('tok'), activationTokenUsedAt: null },
      data: {
        password: 'bcrypt(nuevaClave1)',
        status: 'ACTIVE',
        emailVerified: true,
        activationTokenUsedAt: AHORA,
      },
    });
    expect(mocks.tx.clientRefreshToken.deleteMany).toHaveBeenCalledWith({ where: { clientUserId: 'cu-1' } });
  });

  it('token desconocido → INVALIDO', async () => {
    mocks.prisma.clientUser.findUnique.mockResolvedValue(null);
    await expect(activarCuentaPortal('nada', 'nuevaClave1', AHORA)).rejects.toMatchObject({ codigo: 'INVALIDO' });
  });

  it('token vacío → INVALIDO sin consultar la base', async () => {
    await expect(activarCuentaPortal('', 'nuevaClave1', AHORA)).rejects.toMatchObject({ codigo: 'INVALIDO' });
    expect(mocks.prisma.clientUser.findUnique).not.toHaveBeenCalled();
  });

  it('vencido → VENCIDO y no toca la cuenta', async () => {
    mocks.prisma.clientUser.findUnique.mockResolvedValue(
      vigente({ activationTokenExpiresAt: new Date(AHORA.getTime() - 1) }),
    );
    await expect(activarCuentaPortal('tok', 'nuevaClave1', AHORA)).rejects.toMatchObject({ codigo: 'VENCIDO' });
    expect(mocks.tx.clientUser.updateMany).not.toHaveBeenCalled();
  });

  it('ya usado → USADO (un solo uso)', async () => {
    mocks.prisma.clientUser.findUnique.mockResolvedValue(vigente({ activationTokenUsedAt: new Date() }));
    await expect(activarCuentaPortal('tok', 'nuevaClave1', AHORA)).rejects.toMatchObject({ codigo: 'USADO' });
    expect(mocks.tx.clientUser.updateMany).not.toHaveBeenCalled();
  });

  it('dos envíos a la vez: el que llega segundo encuentra el enlace ya quemado → USADO', async () => {
    mocks.prisma.clientUser.findUnique.mockResolvedValue(vigente());
    mocks.tx.clientUser.updateMany.mockResolvedValue({ count: 0 });
    await expect(activarCuentaPortal('tok', 'nuevaClave1', AHORA)).rejects.toMatchObject({ codigo: 'USADO' });
    expect(mocks.tx.clientRefreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it('cuenta suspendida → no la reactiva', async () => {
    mocks.prisma.clientUser.findUnique.mockResolvedValue(vigente({ status: 'SUSPENDED' }));
    await expect(activarCuentaPortal('tok', 'nuevaClave1', AHORA)).rejects.toMatchObject({ codigo: 'SUSPENDIDA' });
    expect(mocks.tx.clientUser.updateMany).not.toHaveBeenCalled();
  });

  it('contraseña de menos de 8 → 400 y el enlace sigue sirviendo', async () => {
    await expect(activarCuentaPortal('tok', 'corta', AHORA)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.prisma.clientUser.findUnique).not.toHaveBeenCalled();
  });
});

describe('prepararCuentaPortalAlAlta (al crear el contrato)', () => {
  it('ya tenía cuenta (por correo o por cliente) → no crea otra ni manda enlace', async () => {
    mocks.prisma.clientUser.findFirst.mockResolvedValue({ id: 'cu-1' });
    await expect(prepararCuentaPortalAlAlta({ id: 'c-1', email: 'A@B.com' })).resolves.toBeUndefined();
    expect(mocks.prisma.clientUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ email: 'a@b.com' }, { clientId: 'c-1' }] } }),
    );
    expect(mocks.prisma.clientUser.create).not.toHaveBeenCalled();
  });

  it('cuenta nueva: inactiva, contraseña al azar (no la fórmula vieja) y enlace cuyo hash es el guardado', async () => {
    mocks.prisma.clientUser.findFirst.mockResolvedValue(null);
    const url = await prepararCuentaPortalAlAlta({ id: 'c-1', email: 'Ana@Correo.com' });

    const { data } = mocks.prisma.clientUser.create.mock.calls[0][0];
    expect(data).toMatchObject({ clientId: 'c-1', email: 'ana@correo.com', status: 'INACTIVE' });
    // La contraseña es bcrypt de 64 hex al azar.
    expect(data.password).toMatch(/^bcrypt\([0-9a-f]{64}\)$/);
    expect(url).toMatch(/^https:\/\/app\.example\.com\/portal\/activar\?token=/);
    expect(data.activationTokenHash).toBe(hashTokenActivacion(tokenDeUrl(url!)));
    expect(data.activationTokenExpiresAt).toBeInstanceOf(Date);
  });

  it('con el portal apagado crea la cuenta sin enlace y no devuelve URL', async () => {
    mocks.bandera.portal = false;
    mocks.prisma.clientUser.findFirst.mockResolvedValue(null);
    await expect(prepararCuentaPortalAlAlta({ id: 'c-1', email: 'a@b.com' })).resolves.toBeUndefined();
    const { data } = mocks.prisma.clientUser.create.mock.calls[0][0];
    expect(data.status).toBe('INACTIVE');
    expect(data.activationTokenHash).toBeUndefined();
  });
});

describe('reenviarAccesoPortal (botón de la ficha)', () => {
  const cliente = (extra: Record<string, unknown> = {}) => ({
    id: 'c-1',
    email: 'Ana@Correo.com',
    firstName: 'Ana',
    clientUser: { id: 'cu-1', email: 'ana@correo.com', status: 'ACTIVE' },
    ...extra,
  });

  it('portal apagado → 409, no genera nada', async () => {
    mocks.bandera.portal = false;
    await expect(reenviarAccesoPortal('c-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.prisma.client.findUnique).not.toHaveBeenCalled();
  });

  it('cliente sin correo → 400', async () => {
    mocks.prisma.client.findUnique.mockResolvedValue(cliente({ email: null }));
    await expect(reenviarAccesoPortal('c-1')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('cuenta suspendida → 409', async () => {
    mocks.prisma.client.findUnique.mockResolvedValue(
      cliente({ clientUser: { id: 'cu-1', email: 'ana@correo.com', status: 'SUSPENDED' } }),
    );
    await expect(reenviarAccesoPortal('c-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('cuenta existente: enlace nuevo (el anterior deja de servir) y correo con esa URL', async () => {
    mocks.prisma.client.findUnique.mockResolvedValue(cliente());
    const r = await reenviarAccesoPortal('c-1');

    const { where, data } = mocks.prisma.clientUser.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'cu-1' });
    expect(data.activationTokenUsedAt).toBeNull();
    const [destino, nombre, url] = mocks.email.sendPortalAccessEmail.mock.calls[0];
    expect(destino).toBe('ana@correo.com');
    expect(nombre).toBe('Ana');
    expect(data.activationTokenHash).toBe(hashTokenActivacion(tokenDeUrl(url)));
    expect(r.email).toBe('ana@correo.com');
  });

  it('sin cuenta todavía (no tenía correo al contratar) → la crea inactiva', async () => {
    mocks.prisma.client.findUnique.mockResolvedValue(cliente({ clientUser: null }));
    mocks.prisma.clientUser.findUnique.mockResolvedValue(null);
    await reenviarAccesoPortal('c-1');
    expect(mocks.prisma.clientUser.create.mock.calls[0][0].data).toMatchObject({
      clientId: 'c-1', email: 'ana@correo.com', status: 'INACTIVE',
    });
  });

  it('el correo de la ficha ya es de la cuenta de otro cliente → 409 y no manda nada', async () => {
    mocks.prisma.client.findUnique.mockResolvedValue(cliente({ clientUser: null }));
    mocks.prisma.clientUser.findUnique.mockResolvedValue({ clientId: 'otro' });
    await expect(reenviarAccesoPortal('c-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.email.sendPortalAccessEmail).not.toHaveBeenCalled();
  });

  it('si el correo no sale, el equipo se entera (502)', async () => {
    mocks.prisma.client.findUnique.mockResolvedValue(cliente());
    mocks.email.sendPortalAccessEmail.mockRejectedValue(new EmailSendError('No se pudo', 'resend'));
    await expect(reenviarAccesoPortal('c-1')).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe('estadoAccesoPortal', () => {
  it('cuenta inactiva con enlace vigente → PENDIENTE con fecha de vencimiento', async () => {
    const vence = new Date(Date.now() + 60_000);
    mocks.prisma.client.findUnique.mockResolvedValue({
      email: 'a@b.com',
      clientUser: { email: 'a@b.com', status: 'INACTIVE', lastLogin: null, activationTokenExpiresAt: vence, activationTokenUsedAt: null },
    });
    await expect(estadoAccesoPortal('c-1')).resolves.toMatchObject({
      portalActivo: true, estado: 'PENDIENTE', enlaceVenceEl: vence,
    });
  });

  it('sin cuenta → SIN_CUENTA', async () => {
    mocks.prisma.client.findUnique.mockResolvedValue({ email: null, clientUser: null });
    await expect(estadoAccesoPortal('c-1')).resolves.toMatchObject({ estado: 'SIN_CUENTA', enlaceVenceEl: null });
  });
});
