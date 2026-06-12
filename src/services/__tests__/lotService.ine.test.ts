import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    lot: { update: vi.fn() },
    document: { create: vi.fn(), deleteMany: vi.fn() },
  };
  const prisma = {
    lot: { findUnique: vi.fn(), update: vi.fn() },
    document: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  };
  const storage = { saveFile: vi.fn(), getFile: vi.fn(), deleteFile: vi.fn() };
  return { prisma, tx, storage };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  LotStatus: { AVAILABLE: 'AVAILABLE', RESERVED: 'RESERVED', SOLD: 'SOLD', UNAVAILABLE: 'UNAVAILABLE' },
  DocumentType: { CONTRACT: 'CONTRACT', RECEIPT: 'RECEIPT', ID: 'ID', DEED: 'DEED', OTHER: 'OTHER', INE: 'INE' },
}));
vi.mock('../storage', () => ({ getFileStorage: () => mocks.storage }));

import lotService from '../lot.service';
import { IneUploadError } from '../../utils/errors';
import { IneFileInput } from '../ineDocument';

const RESERVE_DATA = { deposit: 5000, clientName: 'Juan Pérez', clientPhone: '8681234567' };

function ineFile(over: Partial<IneFileInput> = {}): IneFileInput {
  return {
    buffer: Buffer.from('ine-bytes'),
    originalName: 'ine-juan.jpg',
    mimeType: 'image/jpeg',
    size: 2048,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.lot.findUnique.mockResolvedValue({ id: 'lot-1', status: 'AVAILABLE' });
  mocks.tx.lot.update.mockResolvedValue({ id: 'lot-1', status: 'RESERVED' });
  mocks.prisma.lot.update.mockResolvedValue({ id: 'lot-1', status: 'RESERVED' });
  mocks.tx.document.create.mockResolvedValue({ id: 'doc-1' });
});

afterEach(() => {
  delete process.env.INE_REQUIRED_FOR_RESERVATION;
});

describe('reserveLot con INE', () => {
  it('flag activo sin archivo → IneUploadError INE_REQUIRED, no toca storage ni reserva', async () => {
    process.env.INE_REQUIRED_FOR_RESERVATION = 'true';
    await expect(lotService.reserveLot('lot-1', RESERVE_DATA)).rejects.toThrow(IneUploadError);
    expect(mocks.storage.saveFile).not.toHaveBeenCalled();
    expect(mocks.prisma.lot.update).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sin archivo y flag inactivo → reserva directa sin transacción ni Document', async () => {
    const result = await lotService.reserveLot('lot-1', RESERVE_DATA);
    expect(result).toEqual({ id: 'lot-1', status: 'RESERVED' });
    expect(mocks.prisma.lot.update).toHaveBeenCalledOnce();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.storage.saveFile).not.toHaveBeenCalled();
  });

  it('con archivo → guarda en storage y crea Document INE en la transacción', async () => {
    await lotService.reserveLot('lot-1', RESERVE_DATA, ineFile(), 'user-7');

    expect(mocks.storage.saveFile).toHaveBeenCalledOnce();
    const [key, buffer, mimeType] = mocks.storage.saveFile.mock.calls[0];
    expect(key).toMatch(/^ine\/lot-1\/[0-9a-f-]{36}\.jpg$/);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(mimeType).toBe('image/jpeg');

    expect(mocks.tx.lot.update).toHaveBeenCalledOnce();
    expect(mocks.tx.document.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentType: 'INE',
        relatedEntity: 'lot',
        relatedEntityId: 'lot-1',
        fileName: 'ine-juan.jpg',
        fileUrl: key,
        fileSize: 2048,
        mimeType: 'image/jpeg',
        uploadedBy: 'user-7',
      }),
    });
  });

  it('con archivo pero sin uploadedBy → lanza y no guarda nada', async () => {
    await expect(lotService.reserveLot('lot-1', RESERVE_DATA, ineFile())).rejects.toThrow();
    expect(mocks.storage.saveFile).not.toHaveBeenCalled();
  });

  it('si la transacción falla tras guardar el archivo → compensa con deleteFile y re-lanza', async () => {
    mocks.tx.document.create.mockRejectedValue(new Error('db caída'));
    await expect(
      lotService.reserveLot('lot-1', RESERVE_DATA, ineFile(), 'user-7')
    ).rejects.toThrow('db caída');

    const savedKey = mocks.storage.saveFile.mock.calls[0][0];
    expect(mocks.storage.deleteFile).toHaveBeenCalledWith(savedKey);
  });

  it('mimetype inválido → INVALID_FILE_TYPE antes de tocar storage', async () => {
    await expect(
      lotService.reserveLot('lot-1', RESERVE_DATA, ineFile({ mimeType: 'image/gif' }), 'user-7')
    ).rejects.toThrow(IneUploadError);
    expect(mocks.storage.saveFile).not.toHaveBeenCalled();
  });
});
