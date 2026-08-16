import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const prisma = { contract: { update: vi.fn() } };
  const storage = { saveFile: vi.fn() };
  return { prisma, storage };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
}));
vi.mock('../../services/storage', () => ({ getFileStorage: () => mocks.storage }));

import contractController from '../contract.controller';

const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
  'binary',
);
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

function runUploadSigned(req: Partial<Request>) {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return contractController.uploadSigned(req as Request, res).then(() => res);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.contract.update.mockResolvedValue({ id: 'contract-1' });
});

describe('uploadSigned — magic bytes, no Content-Type declarado', () => {
  it('PDF real → guarda con mimeType detectado y activa el contrato', async () => {
    const res = await runUploadSigned({
      params: { id: 'contract-1' },
      file: { buffer: PDF_BYTES, mimetype: 'application/pdf' } as any,
    });

    expect(mocks.storage.saveFile).toHaveBeenCalledWith(
      'contracts/contract-1/signed.pdf',
      PDF_BYTES,
      'application/pdf',
    );
    expect(mocks.prisma.contract.update).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      data: { contractFileUrl: 'contracts/contract-1/signed.pdf', status: 'ACTIVE' },
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('archivo real (PNG) pero declarado como PDF → rechazado por firma, nunca se guarda', async () => {
    const res = await runUploadSigned({
      params: { id: 'contract-1' },
      // El cliente miente en el Content-Type multipart — el buffer es un PNG real.
      file: { buffer: PNG_BYTES, mimetype: 'application/pdf' } as any,
    });

    expect(mocks.storage.saveFile).not.toHaveBeenCalled();
    expect(mocks.prisma.contract.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'INVALID_FILE_SIGNATURE' }),
    );
  });

  it('sin firma detectable (buffer corrupto) → rechazado, nunca se guarda', async () => {
    const res = await runUploadSigned({
      params: { id: 'contract-1' },
      file: { buffer: Buffer.from('no soy un pdf'), mimetype: 'application/pdf' } as any,
    });

    expect(mocks.storage.saveFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('sin archivo → 400 sin tocar storage ni el mensaje de firma inválida', async () => {
    const res = await runUploadSigned({ params: { id: 'contract-1' } });

    expect(mocks.storage.saveFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'No se recibió ningún archivo' }),
    );
  });
});
