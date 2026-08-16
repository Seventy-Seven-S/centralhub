// src/services/ineDocument.ts
// Helpers para el documento INE en el flujo de apartado.
// La INE vive asociada al Lot al apartar y migra al Client al formalizar contrato
// (ver docs/superpowers/specs/2026-06-10-ine-apartado-design.md).
import { randomUUID } from 'node:crypto';
import { IneUploadError, InvalidFileSignatureError } from '../utils/errors';
import { validateFileSignature, DetectedFileType } from '../utils/fileSignature';

export interface IneFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

export const MAX_INE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB, igual que upload de contratos

export const ALLOWED_INE_MIMETYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export function isIneRequired(): boolean {
  return process.env.INE_REQUIRED_FOR_RESERVATION === 'true';
}

// El Content-Type declarado (file.mimeType) NO se usa para validar el tipo —
// solo la firma binaria real del buffer (magic bytes, RF seguridad). Retorna
// el tipo REAL detectado, que es el que debe usarse para persistir (key,
// extensión, mimeType guardado) — nunca el declarado.
export async function validateIneUpload(
  file: IneFileInput | undefined,
  required: boolean,
): Promise<DetectedFileType | undefined> {
  if (!file) {
    if (required) {
      throw new IneUploadError('INE_REQUIRED', 'La INE del cliente es obligatoria para apartar');
    }
    return undefined;
  }
  if (file.size > MAX_INE_FILE_SIZE) {
    throw new IneUploadError('FILE_TOO_LARGE', 'El archivo no debe superar 10 MB');
  }
  try {
    return await validateFileSignature(file.buffer, Object.keys(ALLOWED_INE_MIMETYPES));
  } catch (err) {
    if (err instanceof InvalidFileSignatureError) {
      throw new IneUploadError('INVALID_FILE_TYPE', err.message);
    }
    throw err;
  }
}

export function buildIneKey(lotId: string, mimeType: string): string {
  const ext = ALLOWED_INE_MIMETYPES[mimeType];
  if (!ext) {
    throw new IneUploadError('INVALID_FILE_TYPE', 'Solo se aceptan JPG, PNG o PDF');
  }
  return `ine/${lotId}/${randomUUID()}.${ext}`;
}

type TxWithDocuments = {
  document: { updateMany(args: unknown): Promise<unknown> };
};

// Se llama DENTRO de la transacción de createContract: el Document deja de
// colgar del Lot y pasa a ser parte permanente del expediente del Client.
export async function migrateIneToClient(
  tx: TxWithDocuments,
  lotIds: string[],
  clientId: string,
): Promise<void> {
  await tx.document.updateMany({
    where: { relatedEntity: 'lot', relatedEntityId: { in: lotIds }, documentType: 'INE' },
    data: { relatedEntity: 'client', relatedEntityId: clientId },
  });
}
