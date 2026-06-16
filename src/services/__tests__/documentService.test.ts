import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: { document: { findUnique: vi.fn() } },
  storage: { saveFile: vi.fn(), getFile: vi.fn(), deleteFile: vi.fn() },
}));

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));
vi.mock('../storage', () => ({ getFileStorage: () => mocks.storage }));

import documentService from '../document.service';
import { ApiError } from '../../middlewares/errorHandler';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getDocumentFile', () => {
  it('devuelve buffer, mimeType y fileName del documento', async () => {
    mocks.prisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      fileUrl: 'ine/lot-1/abc.jpg',
      mimeType: 'image/jpeg',
      fileName: 'ine-juan.jpg',
    });
    mocks.storage.getFile.mockResolvedValue(Buffer.from('bytes'));

    const result = await documentService.getDocumentFile('doc-1');

    expect(mocks.storage.getFile).toHaveBeenCalledWith('ine/lot-1/abc.jpg');
    expect(result.buffer.toString()).toBe('bytes');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.fileName).toBe('ine-juan.jpg');
  });

  it('documento inexistente → ApiError 404', async () => {
    mocks.prisma.document.findUnique.mockResolvedValue(null);
    await expect(documentService.getDocumentFile('nope')).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(documentService.getDocumentFile('nope')).rejects.toBeInstanceOf(ApiError);
  });

  it('archivo físico inexistente → ApiError 404', async () => {
    mocks.prisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      fileUrl: 'ine/perdido.jpg',
      mimeType: 'image/jpeg',
      fileName: 'x.jpg',
    });
    mocks.storage.getFile.mockRejectedValue(new Error('ENOENT'));
    await expect(documentService.getDocumentFile('doc-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('mimeType null → application/octet-stream', async () => {
    mocks.prisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      fileUrl: 'ine/x.bin',
      mimeType: null,
      fileName: 'x.bin',
    });
    mocks.storage.getFile.mockResolvedValue(Buffer.from('b'));
    const result = await documentService.getDocumentFile('doc-1');
    expect(result.mimeType).toBe('application/octet-stream');
  });
});
