import { promises as fs } from 'fs';
import path from 'path';
import { FileStorage } from './file-storage';

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
    const full = this.resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async getFile(key: string): Promise<Buffer> {
    return await fs.readFile(this.resolveKey(key));
  }

  async deleteFile(key: string): Promise<void> {
    await fs.unlink(this.resolveKey(key));
  }
}
