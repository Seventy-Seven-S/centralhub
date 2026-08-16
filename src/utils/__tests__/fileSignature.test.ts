import { describe, it, expect } from 'vitest';
import { validateFileSignature } from '../fileSignature';
import { InvalidFileSignatureError } from '../errors';

// Buffers mínimos con firma binaria real — file-type solo necesita la
// cabecera, no un archivo completo/válido en su estructura interna.
const JPG_HEADER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
  0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const PDF_BUFFER = Buffer.from(
  '%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
  'binary',
);
// Cabecera PE de un ejecutable Windows, renombrado como si fuera .jpg
const EXE_HEADER = Buffer.from([
  0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff,
]);

const INE_ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];
const PDF_ONLY = ['application/pdf'];

describe('validateFileSignature (magic bytes, no Content-Type declarado)', () => {
  it('test 1: JPG real → detecta image/jpeg y pasa', async () => {
    const result = await validateFileSignature(JPG_HEADER, INE_ALLOWED);
    expect(result.mime).toBe('image/jpeg');
    expect(result.ext).toBe('jpg');
  });

  it('test 2: PNG real → detecta image/png y pasa', async () => {
    const result = await validateFileSignature(PNG_HEADER, INE_ALLOWED);
    expect(result.mime).toBe('image/png');
  });

  it('test 3: PDF real → detecta application/pdf y pasa', async () => {
    const result = await validateFileSignature(PDF_BUFFER, INE_ALLOWED);
    expect(result.mime).toBe('application/pdf');
  });

  it('test 4: ejecutable renombrado a .jpg (cabecera MZ/PE real) → rechazado', async () => {
    await expect(validateFileSignature(EXE_HEADER, INE_ALLOWED)).rejects.toThrow(InvalidFileSignatureError);
  });

  it('test 5: buffer vacío/corrupto (sin firma detectable) → rechazado', async () => {
    await expect(validateFileSignature(Buffer.alloc(0), INE_ALLOWED)).rejects.toThrow(InvalidFileSignatureError);
  });

  it('test 6: bytes aleatorios sin firma reconocible → rechazado', async () => {
    const random = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    await expect(validateFileSignature(random, INE_ALLOWED)).rejects.toThrow(InvalidFileSignatureError);
  });

  it('test 7 (cruzado): PNG real y válido, pero enviado al endpoint de solo-PDF → rechazado', async () => {
    // Es un archivo real y correcto — pero del tipo equivocado para este
    // validador (contrato firmado solo acepta PDF).
    await expect(validateFileSignature(PNG_HEADER, PDF_ONLY)).rejects.toThrow(InvalidFileSignatureError);
  });

  it('test 8: el mime detectado queda en el error para logs, nunca en el mensaje al cliente', async () => {
    try {
      await validateFileSignature(EXE_HEADER, INE_ALLOWED);
      throw new Error('debía rechazar');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidFileSignatureError);
      const e = err as InvalidFileSignatureError;
      expect(e.detectedMime).toBe('application/x-msdownload');
      expect(e.message).not.toContain('msdownload');
      expect(e.message).not.toContain('x-msdownload');
    }
  });

  it('test 9 (límite conocido, documentado — no bloquea el alcance): PDF con cabecera válida pero truncado/sin cuerpo pasa la validación de firma', async () => {
    // Magic bytes solo verifica la CABECERA, no la integridad del archivo.
    // Un PDF truncado (header válido, sin contenido real después) tiene
    // firma binaria correcta y por diseño pasa esta capa — validar
    // integridad/corrupción de contenido es una capa distinta, fuera de
    // alcance de esta iteración (ver diseño: "es el tipo que dice ser",
    // no "es un archivo íntegro y legible").
    const truncatedPdf = Buffer.from('%PDF-1.4', 'binary');
    const result = await validateFileSignature(truncatedPdf, INE_ALLOWED);
    expect(result.mime).toBe('application/pdf');
  });
});
