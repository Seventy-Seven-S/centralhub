import { promises as fs } from 'fs';
import path from 'path';
import { FileStorage, ErrorDeAlmacenamiento } from './file-storage';

export class LocalDiskStorage implements FileStorage {
  constructor(private readonly baseDir: string) {}

  // Resuelve la key dentro de baseDir y bloquea path traversal.
  private resolveKey(key: string): string {
    const base = path.resolve(this.baseDir);
    const full = path.resolve(base, key);
    if (!full.startsWith(base + path.sep)) {
      throw new Error(`Key inválida: ${key}`);
    }
    return full;
  }

  async saveFile(key: string, data: Buffer, _mimeType: string): Promise<void> {
    // resolveKey va fuera del try: una key inválida es un intento de escribir
    // fuera de la carpeta, y ese error sí debe verse tal cual.
    const full = this.resolveKey(key);
    try {
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, data);
    } catch (e: any) {
      throw new ErrorDeAlmacenamiento(
        'No se pudo guardar el documento. El contrato sí quedó registrado; vuelve a subir el archivo más tarde o avisa a soporte.',
        `${e?.code ?? 'ERROR'}: ${e?.message ?? e}`,
      );
    }
  }

  async getFile(key: string): Promise<Buffer> {
    const full = this.resolveKey(key);
    try {
      return await fs.readFile(full);
    } catch (e: any) {
      throw new ErrorDeAlmacenamiento(
        'No se pudo abrir el documento. Puede que no se haya guardado correctamente.',
        `${e?.code ?? 'ERROR'}: ${e?.message ?? e}`,
      );
    }
  }

  async deleteFile(key: string): Promise<void> {
    const full = this.resolveKey(key);
    try {
      await fs.unlink(full);
    } catch (e: any) {
      throw new ErrorDeAlmacenamiento(
        'No se pudo borrar el documento.',
        `${e?.code ?? 'ERROR'}: ${e?.message ?? e}`,
      );
    }
  }
}
