// src/services/portalAcceso.service.ts
//
// Acceso de los clientes al portal: cuenta inicial, enlace de activación de un
// solo uso y detección de la contraseña vieja adivinable.
//
// Antes la cuenta nacía con contraseña = apellido[0:4] + teléfono[-4:] (o
// 'Central2024') y viajaba en claro en el correo. Cualquiera con el contrato
// en la mano (asesor, familiar, quien viera el correo) podía entrar. Ahora la
// cuenta nace con una contraseña aleatoria que nadie conoce y el cliente crea
// la suya con un enlace que vence en 7 días y sirve una sola vez.
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import { ApiError } from '../middlewares/errorHandler';
import { normalizeEmail } from '../utils/normalizeEmail';
import { PORTAL_DE_CLIENTES_ACTIVO } from '../utils/portalClientes';
import { EmailSendError } from '../utils/errors';
import { appUrl, sendPortalAccessEmail } from './email.service';

export const VIGENCIA_ENLACE_MS = 7 * 24 * 60 * 60 * 1000;
export const LARGO_MINIMO_CONTRASENA = 8;
const BCRYPT_ROUNDS = 10;

/** Contraseña genérica que se usaba cuando el cliente no tenía apellido ni teléfono. */
const CONTRASENA_GENERICA_VIEJA = 'Central2024';

// ── Token ────────────────────────────────────────────────────────────────────

/**
 * SHA-256 del token. En la base solo vive esto: quien obtenga una copia de la
 * tabla no puede reconstruir el enlace. No hace falta bcrypt porque el token
 * tiene 256 bits de azar — no hay diccionario contra el cual probar.
 */
export function hashTokenActivacion(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generarTokenActivacion(ahora: Date = new Date()) {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashTokenActivacion(token),
    expiresAt: new Date(ahora.getTime() + VIGENCIA_ENLACE_MS),
  };
}

export function urlActivacion(token: string): string {
  return `${appUrl()}/portal/activar?token=${encodeURIComponent(token)}`;
}

/**
 * Hash bcrypt de 32 bytes al azar que no se guardan en ningún lado: la cuenta
 * existe (y su email queda reservado) pero nadie puede entrar con contraseña
 * hasta que el cliente use su enlace.
 */
async function hashContrasenaInutilizable(): Promise<string> {
  return bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
}

// ── Contraseña vieja adivinable ──────────────────────────────────────────────

/**
 * ¿Es la contraseña que el sistema le asignaba al cliente con la fórmula
 * vieja? Se calcula igual que la creaba contract.service: primeras 4 letras
 * del apellido + últimos 4 del teléfono, en minúsculas; si salía vacía,
 * 'Central2024'. 'Central2024' también cuenta siempre, porque era pública.
 */
export function esContrasenaAdivinable(
  password: string,
  cliente: { lastName?: string | null; phone?: string | null },
): boolean {
  if (password === CONTRASENA_GENERICA_VIEJA) return true;
  const formula = ((cliente.lastName ?? '').slice(0, 4) + (cliente.phone ?? '').slice(-4)).toLowerCase();
  return formula !== '' && password === formula;
}

// ── Alta con el contrato ─────────────────────────────────────────────────────

/**
 * Crea la cuenta del portal al dar de alta un contrato, si el cliente aún no
 * tiene una. Nace INACTIVA y con contraseña inutilizable; se activa con el
 * enlace. Devuelve la URL del enlace para el correo de bienvenida, o
 * undefined si ya tenía cuenta o si el portal está apagado (sin portal no se
 * genera un enlace que nadie va a recibir).
 */
export async function prepararCuentaPortalAlAlta(cliente: {
  id: string;
  email: string;
}): Promise<string | undefined> {
  const email = normalizeEmail(cliente.email);
  const existente = await prisma.clientUser.findFirst({
    where: { OR: [{ email }, { clientId: cliente.id }] },
    select: { id: true },
  });
  if (existente) return undefined;

  const enlace = PORTAL_DE_CLIENTES_ACTIVO ? generarTokenActivacion() : null;
  await prisma.clientUser.create({
    data: {
      clientId: cliente.id,
      email,
      password: await hashContrasenaInutilizable(),
      status: 'INACTIVE',
      ...(enlace && {
        activationTokenHash: enlace.hash,
        activationTokenExpiresAt: enlace.expiresAt,
      }),
    },
  });
  return enlace ? urlActivacion(enlace.token) : undefined;
}

// ── Activación ───────────────────────────────────────────────────────────────

export type MotivoEnlaceInvalido = 'INVALIDO' | 'VENCIDO' | 'USADO' | 'SUSPENDIDA';

/** El enlace no sirve. El código le dice al portal qué pantalla mostrar. */
export class EnlaceActivacionError extends Error {
  constructor(public readonly codigo: MotivoEnlaceInvalido, message: string) {
    super(message);
    this.name = 'EnlaceActivacionError';
  }
}

const MENSAJES_ENLACE: Record<MotivoEnlaceInvalido, string> = {
  INVALIDO: 'El enlace no es válido. Revisa que lo hayas copiado completo o pide uno nuevo.',
  VENCIDO: 'El enlace ya venció. Pide uno nuevo a tu asesor.',
  USADO: 'Este enlace ya se usó. Inicia sesión con la contraseña que creaste.',
  SUSPENDIDA: 'Tu cuenta está suspendida. Comunícate con la oficina.',
};

function errorEnlace(codigo: MotivoEnlaceInvalido): EnlaceActivacionError {
  return new EnlaceActivacionError(codigo, MENSAJES_ENLACE[codigo]);
}

/**
 * Canjea el enlace: guarda la contraseña nueva, marca el enlace como usado y
 * deja la cuenta activa. Cierra cualquier sesión abierta de esa cuenta, porque
 * el enlace también sirve para recuperar el acceso y quien tuviera la
 * contraseña anterior no debe seguir dentro.
 */
export async function activarCuentaPortal(token: string, password: string, ahora: Date = new Date()) {
  if (typeof token !== 'string' || token.length === 0) throw errorEnlace('INVALIDO');
  if (typeof password !== 'string' || password.length < LARGO_MINIMO_CONTRASENA) {
    throw new ApiError(400, `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`);
  }

  const hash = hashTokenActivacion(token);
  const cuenta = await prisma.clientUser.findUnique({
    where: { activationTokenHash: hash },
    select: { id: true, status: true, activationTokenExpiresAt: true, activationTokenUsedAt: true },
  });
  if (!cuenta) throw errorEnlace('INVALIDO');
  if (cuenta.activationTokenUsedAt) throw errorEnlace('USADO');
  if (!cuenta.activationTokenExpiresAt || cuenta.activationTokenExpiresAt.getTime() <= ahora.getTime()) {
    throw errorEnlace('VENCIDO');
  }
  // Suspender es una decisión del equipo; el enlace no la deshace.
  if (cuenta.status === 'SUSPENDED') throw errorEnlace('SUSPENDIDA');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await prisma.$transaction(async (tx) => {
    // Un solo uso aunque lleguen dos envíos a la vez: solo uno encuentra el
    // enlace todavía sin usar.
    const { count } = await tx.clientUser.updateMany({
      where: { id: cuenta.id, activationTokenHash: hash, activationTokenUsedAt: null },
      data: {
        password: passwordHash,
        status: 'ACTIVE',
        emailVerified: true,
        activationTokenUsedAt: ahora,
      },
    });
    if (count !== 1) throw errorEnlace('USADO');
    await tx.clientRefreshToken.deleteMany({ where: { clientUserId: cuenta.id } });
  });
}

// ── Reenvío desde la ficha del cliente ───────────────────────────────────────

export type EstadoAccesoPortal = 'SIN_CUENTA' | 'PENDIENTE' | 'ACTIVA' | 'SUSPENDIDA';

export async function estadoAccesoPortal(clientId: string) {
  const cliente = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      email: true,
      clientUser: {
        select: { email: true, status: true, lastLogin: true, activationTokenExpiresAt: true, activationTokenUsedAt: true },
      },
    },
  });
  if (!cliente) throw new ApiError(404, 'Cliente no encontrado');

  const cu = cliente.clientUser;
  let estado: EstadoAccesoPortal = 'SIN_CUENTA';
  if (cu) {
    estado = cu.status === 'SUSPENDED' ? 'SUSPENDIDA' : cu.status === 'ACTIVE' ? 'ACTIVA' : 'PENDIENTE';
  }
  const enlaceVigente =
    !!cu?.activationTokenExpiresAt && !cu.activationTokenUsedAt && cu.activationTokenExpiresAt.getTime() > Date.now();

  return {
    portalActivo: PORTAL_DE_CLIENTES_ACTIVO,
    email: cliente.email,
    estado,
    ultimoAcceso: cu?.lastLogin ?? null,
    enlaceVenceEl: enlaceVigente ? cu!.activationTokenExpiresAt : null,
  };
}

/**
 * Genera un enlace nuevo y se lo manda al correo actual del cliente. Si el
 * cliente aún no tenía cuenta (no tenía correo cuando se hizo su contrato) se
 * la crea. Un enlace anterior deja de servir: solo vale el último.
 *
 * La cuenta sigue al correo de la ficha: si el equipo corrigió el correo del
 * cliente, la cuenta pasa a ese correo, porque es ahí a donde llega el enlace
 * y es con el que el cliente va a intentar entrar.
 */
export async function reenviarAccesoPortal(clientId: string) {
  if (!PORTAL_DE_CLIENTES_ACTIVO) {
    throw new ApiError(409, 'El portal de clientes está apagado: no se puede mandar el acceso.');
  }

  const cliente = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, email: true, firstName: true, clientUser: { select: { id: true, email: true, status: true } } },
  });
  if (!cliente) throw new ApiError(404, 'Cliente no encontrado');
  if (!cliente.email?.trim()) {
    throw new ApiError(400, 'El cliente no tiene correo registrado. Agrégalo en su ficha y vuelve a intentar.');
  }
  if (cliente.clientUser?.status === 'SUSPENDED') {
    throw new ApiError(409, 'La cuenta del portal de este cliente está suspendida.');
  }

  const email = normalizeEmail(cliente.email);
  if (cliente.clientUser?.email !== email) {
    const ocupado = await prisma.clientUser.findUnique({ where: { email }, select: { clientId: true } });
    if (ocupado && ocupado.clientId !== cliente.id) {
      throw new ApiError(409, 'Ese correo ya lo usa la cuenta del portal de otro cliente.');
    }
  }

  const enlace = generarTokenActivacion();
  const datosEnlace = {
    email,
    activationTokenHash: enlace.hash,
    activationTokenExpiresAt: enlace.expiresAt,
    activationTokenUsedAt: null,
  };

  if (cliente.clientUser) {
    await prisma.clientUser.update({ where: { id: cliente.clientUser.id }, data: datosEnlace });
  } else {
    await prisma.clientUser.create({
      data: {
        clientId: cliente.id,
        password: await hashContrasenaInutilizable(),
        status: 'INACTIVE',
        ...datosEnlace,
      },
    });
  }

  try {
    await sendPortalAccessEmail(email, cliente.firstName, urlActivacion(enlace.token));
  } catch (err) {
    if (err instanceof EmailSendError) throw new ApiError(502, err.message);
    throw err;
  }

  return { email, enlaceVenceEl: enlace.expiresAt };
}
