import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock se iza al inicio del archivo, así que el doble no puede vivir en una
// variable de módulo: se crea dentro de la fábrica y se recupera después.
vi.mock('fs', () => ({
  promises: { mkdir: vi.fn(), writeFile: vi.fn(), readFile: vi.fn(), unlink: vi.fn() },
}));

import { promises as fsMock } from 'fs';

import { LocalDiskStorage } from '../local-disk-storage';
import { ErrorDeAlmacenamiento } from '../file-storage';

describe('LocalDiskStorage — fallas de disco', () => {
  const store = new LocalDiskStorage('/data/storage');
  beforeEach(() => { vi.clearAllMocks(); });

  it('convierte un EACCES en un error que una secretaria pueda entender', async () => {
    // Lo que veía en pantalla era: EACCES: permission denied, mkdir '/data/storage'
    const eacces: any = new Error("EACCES: permission denied, mkdir '/data/storage'");
    eacces.code = 'EACCES';
    (fsMock.mkdir as any).mockRejectedValueOnce(eacces);

    const fallo = await store.saveFile('x/y.pdf', Buffer.from('a'), 'application/pdf').catch(e => e);
    expect(fallo).toBeInstanceOf(ErrorDeAlmacenamiento);
    expect(fallo.message).not.toMatch(/EACCES|permission denied|mkdir/i);
    expect(fallo.message).toMatch(/no se pudo guardar/i);
    // El detalle técnico se conserva para el log, no para la pantalla.
    expect(fallo.detalle).toMatch(/EACCES/);
  });

  it('también cubre el disco lleno', async () => {
    const enospc: any = new Error('ENOSPC: no space left on device');
    enospc.code = 'ENOSPC';
    (fsMock.mkdir as any).mockResolvedValueOnce(undefined);
    (fsMock.writeFile as any).mockRejectedValueOnce(enospc);

    const fallo = await store.saveFile('x/y.pdf', Buffer.from('a'), 'application/pdf').catch(e => e);
    expect(fallo).toBeInstanceOf(ErrorDeAlmacenamiento);
    expect(fallo.message).not.toMatch(/ENOSPC/);
  });

  it('no estorba cuando todo sale bien', async () => {
    (fsMock.mkdir as any).mockResolvedValueOnce(undefined);
    (fsMock.writeFile as any).mockResolvedValueOnce(undefined);
    await expect(store.saveFile('x/y.pdf', Buffer.from('a'), 'application/pdf')).resolves.toBeUndefined();
  });

  it('sigue bloqueando una key que intente salirse de la carpeta', async () => {
    await expect(store.saveFile('../../etc/passwd', Buffer.from('a'), 'text/plain')).rejects.toThrow(/inv[áa]lida/i);
  });
});
