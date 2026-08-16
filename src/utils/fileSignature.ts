import { InvalidFileSignatureError } from './errors';

export interface DetectedFileType {
  mime: string;
  ext: string;
}

// Nombres legibles para armar el mensaje de error sin revelar lo detectado.
const READABLE_NAME: Record<string, string> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'application/pdf': 'PDF',
};

function describeAllowed(allowedMimeTypes: readonly string[]): string {
  const names = allowedMimeTypes.map(m => READABLE_NAME[m] ?? m);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} o ${names[names.length - 1]}`;
}

// Única fuente de verdad para validar el TIPO REAL de un archivo subido, vía
// su firma binaria (magic bytes) — no el Content-Type declarado por el
// cliente ni la extensión del nombre de archivo, ambos falsificables.
// Usado tanto por el flujo de INE como por el de contrato firmado.
export async function validateFileSignature(
  buffer: Buffer,
  allowedMimeTypes: readonly string[],
): Promise<DetectedFileType> {
  const { fileTypeFromBuffer } = await import('file-type');
  const detected = await fileTypeFromBuffer(buffer);

  if (!detected || !allowedMimeTypes.includes(detected.mime)) {
    throw new InvalidFileSignatureError(
      `El archivo no es un ${describeAllowed(allowedMimeTypes)} válido`,
      detected?.mime,
    );
  }

  return detected;
}
