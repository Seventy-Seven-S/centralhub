// src/controllers/document.controller.ts
import { Request, Response } from 'express';
import documentService from '../services/document.service';
import { asyncHandler } from '../middlewares/errorHandler';

// GET /api/v1/documents/:id/file — solo ADMIN/MANAGER (enforced en la ruta)
export const getDocumentFile = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { buffer, mimeType, fileName } = await documentService.getDocumentFile(id);

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
  res.send(buffer);
});
