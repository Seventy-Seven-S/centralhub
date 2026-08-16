// src/routes/lot.routes.ts
import { Router } from 'express';
import multer from 'multer';
import lotController from '../controllers/lot.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { MAX_INE_FILE_SIZE } from '../services/ineDocument';
import { handleMulterUpload } from '../middlewares/handleMulterUpload';

// memoryStorage: el buffer pasa por la abstracción FileStorage (swap a S3 sin tocar multer).
// El mimetype se valida en el service (validateIneUpload) — fuente de verdad única.
const ineUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_INE_FILE_SIZE },
});

const handleIneFile = handleMulterUpload(ineUpload, 'ineFile');

const router = Router();

router.use(authenticate);

const adminOrManager = authorize('ADMIN', 'MANAGER');

// Lectura — todos los roles autenticados pueden ver lotes
router.get('/',    lotController.getAll);
router.get('/:id', lotController.getById);

// Escritura — solo ADMIN y MANAGER
router.post('/',   adminOrManager, lotController.create);
router.put('/:id', adminOrManager, lotController.update);

// Apartados — solo ADMIN y MANAGER (acepta multipart con campo ineFile opcional)
router.post('/:id/reserve',   adminOrManager, handleIneFile, lotController.reserve);
router.delete('/:id/reserve', adminOrManager, lotController.releaseReservation);

export default router;
