import { FileStorage } from './file-storage';
import { LocalDiskStorage } from './local-disk-storage';

let instance: FileStorage | null = null;

export function getFileStorage(): FileStorage {
  if (instance) return instance;
  const driver = process.env.STORAGE_DRIVER ?? 'local';
  if (driver !== 'local') {
    throw new Error(`STORAGE_DRIVER no soportado: ${driver}`);
  }
  instance = new LocalDiskStorage(process.env.FILE_STORAGE_DIR ?? './storage/private');
  return instance;
}

export type { FileStorage };
