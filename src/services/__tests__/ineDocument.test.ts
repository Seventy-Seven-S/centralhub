import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  validateIneUpload,
  buildIneKey,
  isIneRequired,
  migrateIneToClient,
  MAX_INE_FILE_SIZE,
  IneFileInput,
} from '../ineDocument';
import { IneUploadError } from '../../utils/errors';

// Firmas binarias reales — desde esta iteración validateIneUpload valida
// magic bytes, no el mimeType declarado (que ya no se usa para decidir).
const JPG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
  0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
  'binary',
);

function file(over: Partial<IneFileInput> = {}): IneFileInput {
  return {
    buffer: JPG_BYTES,
    originalName: 'ine.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    ...over,
  };
}

async function expectCode(fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
    expect.unreachable('debió lanzar IneUploadError');
  } catch (e) {
    expect(e).toBeInstanceOf(IneUploadError);
    expect((e as IneUploadError).code).toBe(code);
  }
}

describe('validateIneUpload', () => {
  it('flag activo sin archivo → INE_REQUIRED', async () => {
    await expectCode(() => validateIneUpload(undefined, true), 'INE_REQUIRED');
  });

  it('flag inactivo sin archivo → no lanza', async () => {
    await expect(validateIneUpload(undefined, false)).resolves.toBeUndefined();
  });

  it('buffer sin firma real de JPG/PNG/PDF (aunque declare mimeType válido) → INVALID_FILE_TYPE', async () => {
    await expectCode(
      () => validateIneUpload(file({ buffer: Buffer.from('esto no es una imagen') }), false),
      'INVALID_FILE_TYPE',
    );
  });

  it('tamaño excedido → FILE_TOO_LARGE (se valida antes de leer la firma)', async () => {
    await expectCode(() => validateIneUpload(file({ size: MAX_INE_FILE_SIZE + 1 }), false), 'FILE_TOO_LARGE');
  });

  it('happy path: JPG, PNG y PDF reales pasan con flag activo, y retornan el tipo detectado', async () => {
    const cases: Array<[Buffer, string]> = [
      [JPG_BYTES, 'image/jpeg'],
      [PNG_BYTES, 'image/png'],
      [PDF_BYTES, 'application/pdf'],
    ];
    for (const [buffer, expectedMime] of cases) {
      const detected = await validateIneUpload(file({ buffer }), true);
      expect(detected?.mime).toBe(expectedMime);
    }
  });
});

describe('buildIneKey', () => {
  it('genera key ine/{lotId}/{uuid}.{ext}', () => {
    expect(buildIneKey('lot-123', 'image/png')).toMatch(/^ine\/lot-123\/[0-9a-f-]{36}\.png$/);
    expect(buildIneKey('lot-123', 'image/jpeg')).toMatch(/\.jpg$/);
    expect(buildIneKey('lot-123', 'application/pdf')).toMatch(/\.pdf$/);
  });

  it('mimetype desconocido lanza INVALID_FILE_TYPE', () => {
    expect(() => buildIneKey('lot-1', 'image/gif')).toThrow(IneUploadError);
    try {
      buildIneKey('lot-1', 'image/gif');
      expect.unreachable('debió lanzar IneUploadError');
    } catch (e) {
      expect((e as IneUploadError).code).toBe('INVALID_FILE_TYPE');
    }
  });
});

describe('isIneRequired', () => {
  afterEach(() => {
    delete process.env.INE_REQUIRED_FOR_RESERVATION;
  });

  it("true cuando la env es 'true'", () => {
    process.env.INE_REQUIRED_FOR_RESERVATION = 'true';
    expect(isIneRequired()).toBe(true);
  });

  it('false por default y con cualquier otro valor', () => {
    expect(isIneRequired()).toBe(false);
    process.env.INE_REQUIRED_FOR_RESERVATION = 'false';
    expect(isIneRequired()).toBe(false);
  });
});

describe('migrateIneToClient', () => {
  it('hace updateMany de lot→client con los ids correctos', async () => {
    const tx = { document: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    await migrateIneToClient(tx, ['lot-1', 'lot-2'], 'client-9');
    expect(tx.document.updateMany).toHaveBeenCalledWith({
      where: { relatedEntity: 'lot', relatedEntityId: { in: ['lot-1', 'lot-2'] }, documentType: 'INE' },
      data: { relatedEntity: 'client', relatedEntityId: 'client-9' },
    });
  });
});
