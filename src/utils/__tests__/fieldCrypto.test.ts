import { describe, it, expect, beforeEach } from 'vitest';
import { encryptField, decryptField, isEncrypted } from '../fieldCrypto';

// Clave de prueba: 32 bytes en hex (64 chars)
const TEST_KEY = 'a'.repeat(64);

beforeEach(() => {
  process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
});

describe('encryptField / decryptField', () => {
  it('roundtrip: descifra exactamente lo cifrado', () => {
    const enc = encryptField('GOMM880812HTSNRG09');
    expect(enc).not.toContain('GOMM');
    expect(decryptField(enc)).toBe('GOMM880812HTSNRG09');
  });

  it('el valor cifrado lleva el prefijo versionado enc:v1:', () => {
    expect(encryptField('Casado')).toMatch(/^enc:v1:/);
  });

  it('dos cifrados del mismo valor difieren (IV aleatorio)', () => {
    expect(encryptField('Soltero')).not.toBe(encryptField('Soltero'));
  });

  it('soporta acentos y ñ (utf-8)', () => {
    const enc = encryptField('Cañón de Peña, México');
    expect(decryptField(enc)).toBe('Cañón de Peña, México');
  });

  it('decryptField deja pasar texto plano legado sin tocarlo', () => {
    expect(decryptField('TEXTO-PLANO-VIEJO')).toBe('TEXTO-PLANO-VIEJO');
  });

  it('decryptField tolera null/undefined/vacío', () => {
    expect(decryptField(null)).toBeNull();
    expect(decryptField(undefined)).toBeUndefined();
    expect(decryptField('')).toBe('');
  });

  it('encryptField tolera null/undefined/vacío sin cifrar', () => {
    expect(encryptField(null)).toBeNull();
    expect(encryptField(undefined)).toBeUndefined();
    expect(encryptField('')).toBe('');
  });

  it('detecta manipulación del ciphertext (GCM auth tag)', () => {
    const enc = encryptField('dato sensible');
    const parts = enc.split(':');
    // corromper el ciphertext (última parte)
    const corrupted = [...parts.slice(0, 4), Buffer.from('xxxx').toString('base64')].join(':');
    expect(() => decryptField(corrupted)).toThrow();
  });

  it('sin FIELD_ENCRYPTION_KEY, cifrar lanza error claro', () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(() => encryptField('algo')).toThrow(/FIELD_ENCRYPTION_KEY/);
  });

  it('con clave de longitud inválida, cifrar lanza error claro', () => {
    process.env.FIELD_ENCRYPTION_KEY = 'corta';
    expect(() => encryptField('algo')).toThrow(/FIELD_ENCRYPTION_KEY/);
  });
});

describe('isEncrypted', () => {
  it('true para valores cifrados, false para planos/null', () => {
    expect(isEncrypted(encryptField('x'))).toBe(true);
    expect(isEncrypted('plano')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });
});

describe('encryptFields / decryptFields (objetos)', () => {
  it('cifra solo los campos indicados y deja el resto igual', async () => {
    const { encryptFields, decryptFields } = await import('../fieldCrypto');
    const obj = { nombre: 'Ana', ine: 'ABC123', curp: null, estadoCivil: 'Casada' };
    const enc = encryptFields(obj, ['ine', 'curp', 'estadoCivil']);
    expect(enc.nombre).toBe('Ana');
    expect(enc.ine).toMatch(/^enc:v1:/);
    expect(enc.curp).toBeNull();
    expect(enc.estadoCivil).toMatch(/^enc:v1:/);
    const dec = decryptFields(enc, ['ine', 'curp', 'estadoCivil']);
    expect(dec).toEqual(obj);
  });

  it('decryptFields tolera objetos null (registros no encontrados)', async () => {
    const { decryptFields } = await import('../fieldCrypto');
    expect(decryptFields(null, ['ine'])).toBeNull();
  });

  it('no muta el objeto original', async () => {
    const { encryptFields } = await import('../fieldCrypto');
    const obj = { ine: 'XYZ' };
    encryptFields(obj, ['ine']);
    expect(obj.ine).toBe('XYZ');
  });
});
