// src/routes/document.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { getDocumentFile } from '../controllers/document.controller';

const router = Router();

router.use(authenticate);

// Documentos sensibles (INE): solo ADMIN y MANAGER pueden consultarlos.
// Los agentes pueden subir (vía /lots/:id/reserve) pero no consultar.
router.get('/:id/file', authorize('ADMIN', 'MANAGER'), getDocumentFile);

export default router;
