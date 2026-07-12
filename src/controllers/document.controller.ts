// src/controllers/document.controller.ts
import { Request, Response } from 'express';
import documentService from '../services/document.service';
import { asyncHandler } from '../middlewares/errorHandler';
import { logger } from '../utils/logger';

// GET /api/v1/documents/:id/file — solo ADMIN/MANAGER (enforced en la ruta)
export const getDocumentFile = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { buffer, mimeType, fileName } = await documentService.getDocumentFile(id);

  // Log de acceso a datos sensibles (Arquitectura §7.3): quién vio qué documento
  logger.info(
    `[acceso-doc-sensible] user=${req.user?.userId ?? 'desconocido'} role=${req.user?.role ?? '?'} ` +
    `documento=${id} archivo="${fileName}" ip=${req.ip}`,
  );

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
  res.send(buffer);
});
