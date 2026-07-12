// src/utils/fieldCrypto.ts
// Cifrado a nivel aplicación (AES-256-GCM) para campos sensibles del cliente
// (INE, CURP, estado civil, lugar de nacimiento) — requisito del doc de
// Arquitectura §7.3 "Encriptación en reposo: AES-256 para datos sensibles".
//
// Formato: enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
//  - el prefijo versionado permite distinguir texto plano legado (pasa tal
//    cual en decryptField) y rotar el esquema en el futuro
//  - IV aleatorio de 12 bytes por valor; el tag GCM autentica el contenido
//
// La clave viene de FIELD_ENCRYPTION_KEY (32 bytes en hex, 64 caracteres).
// Generar con: openssl rand -hex 32
import crypto from 'crypto';

const PREFIX = 'enc:v1:';
const IV_BYTES = 12;

function getKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY inválida o ausente: se requieren 32 bytes en hex (64 chars). Genera una con: openssl rand -hex 32',
    );
  }
  return Buffer.from(hex, 'hex');
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptField<T extends string | null | undefined>(value: T): T {
  if (value === null || value === undefined || value === '') return value;
  if (isEncrypted(value)) return value; // idempotente: no doble-cifrar

  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}` as T;
}

// Versiones sobre objeto: cifran/descifran solo los campos indicados sin
// mutar el original. decryptFields tolera null (registro no encontrado).
export function encryptFields<T extends Record<string, any>>(obj: T, fields: Array<keyof T>): T {
  const out: any = { ...obj };
  for (const f of fields) out[f] = encryptField(out[f]);
  return out;
}

export function decryptFields<T extends Record<string, any> | null | undefined>(
  obj: T,
  fields: Array<string>,
): T {
  if (obj === null || obj === undefined) return obj;
  const out: any = { ...obj };
  for (const f of fields) out[f] = decryptField(out[f]);
  return out;
}

// Campos sensibles por modelo (única fuente de verdad para los boundaries)
export const CLIENT_SENSITIVE_FIELDS = ['ine', 'curp', 'estadoCivil', 'lugarNacimiento'] as const;
export const COOWNER_SENSITIVE_FIELDS = ['ine', 'estadoCivil', 'lugarNacimiento'] as const;

export function decryptField<T extends string | null | undefined>(value: T): T {
  if (value === null || value === undefined || value === '') return value;
  if (!isEncrypted(value)) return value; // texto plano legado (pre-migración)

  const [ivB64, tagB64, ctB64] = (value as string).slice(PREFIX.length).split(':');
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return plain.toString('utf8') as T;
}
