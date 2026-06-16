// src/services/document.service.ts
import { prisma } from '../config/database';
import { ApiError } from '../middlewares/errorHandler';
import { getFileStorage } from './storage';

export class DocumentService {
  async getDocumentFile(id: string) {
    const doc = await prisma.document.findUnique({ where: { id } });

    if (!doc) {
      throw new ApiError(404, 'Documento no encontrado');
    }

    let buffer: Buffer;
    try {
      buffer = await getFileStorage().getFile(doc.fileUrl);
    } catch {
      throw new ApiError(404, 'Archivo no encontrado');
    }

    return {
      buffer,
      mimeType: doc.mimeType ?? 'application/octet-stream',
      fileName: doc.fileName,
    };
  }
}

export default new DocumentService();
