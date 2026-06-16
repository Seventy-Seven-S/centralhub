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

function file(over: Partial<IneFileInput> = {}): IneFileInput {
  return {
    buffer: Buffer.from('x'),
    originalName: 'ine.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    ...over,
  };
}

function expectCode(fn: () => void, code: string) {
  try {
    fn();
    expect.unreachable('debió lanzar IneUploadError');
  } catch (e) {
    expect(e).toBeInstanceOf(IneUploadError);
    expect((e as IneUploadError).code).toBe(code);
  }
}

describe('validateIneUpload', () => {
  it('flag activo sin archivo → INE_REQUIRED', () => {
    expectCode(() => validateIneUpload(undefined, true), 'INE_REQUIRED');
  });

  it('flag inactivo sin archivo → no lanza', () => {
    expect(() => validateIneUpload(undefined, false)).not.toThrow();
  });

  it('mimetype inválido → INVALID_FILE_TYPE', () => {
    expectCode(() => validateIneUpload(file({ mimeType: 'image/gif' }), false), 'INVALID_FILE_TYPE');
  });

  it('tamaño excedido → FILE_TOO_LARGE', () => {
    expectCode(() => validateIneUpload(file({ size: MAX_INE_FILE_SIZE + 1 }), false), 'FILE_TOO_LARGE');
  });

  it('happy path: JPG, PNG y PDF pasan con flag activo', () => {
    for (const mimeType of ['image/jpeg', 'image/png', 'application/pdf']) {
      expect(() => validateIneUpload(file({ mimeType }), true)).not.toThrow();
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
    expectCode(() => buildIneKey('lot-1', 'image/gif'), 'INVALID_FILE_TYPE');
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
