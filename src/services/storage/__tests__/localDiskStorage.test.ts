import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { LocalDiskStorage } from '../local-disk-storage';

let dir: string;
let storage: LocalDiskStorage;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'ine-storage-'));
  storage = new LocalDiskStorage(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('LocalDiskStorage', () => {
  it('round-trip: saveFile → getFile devuelve el mismo contenido', async () => {
    const data = Buffer.from('contenido-ine');
    await storage.saveFile('ine/lot-1/abc.jpg', data, 'image/jpeg');
    const result = await storage.getFile('ine/lot-1/abc.jpg');
    expect(result.equals(data)).toBe(true);
  });

  it('saveFile crea subdirectorios intermedios de la key', async () => {
    await storage.saveFile('ine/lote-nuevo/sub.pdf', Buffer.from('pdf'), 'application/pdf');
    const result = await storage.getFile('ine/lote-nuevo/sub.pdf');
    expect(result.toString()).toBe('pdf');
  });

  it('getFile de key inexistente lanza', async () => {
    await expect(storage.getFile('ine/no-existe.jpg')).rejects.toThrow();
  });

  it('deleteFile elimina el archivo; getFile posterior lanza', async () => {
    await storage.saveFile('ine/x.png', Buffer.from('png'), 'image/png');
    await storage.deleteFile('ine/x.png');
    await expect(storage.getFile('ine/x.png')).rejects.toThrow();
  });

  it('rechaza keys con path traversal', async () => {
    await expect(storage.getFile('../fuera.txt')).rejects.toThrow('Key inválida');
    await expect(
      storage.saveFile('../../etc/passwd', Buffer.from('x'), 'image/png')
    ).rejects.toThrow('Key inválida');
  });
});
