// src/routes/lot.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import lotController from '../controllers/lot.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { MAX_INE_FILE_SIZE } from '../services/ineDocument';

// memoryStorage: el buffer pasa por la abstracción FileStorage (swap a S3 sin tocar multer).
// El mimetype se valida en el service (validateIneUpload) — fuente de verdad única.
const ineUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_INE_FILE_SIZE },
});

function handleIneFile(req: Request, res: Response, next: NextFunction) {
  ineUpload.single('ineFile')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          code: 'FILE_TOO_LARGE',
          message: 'El archivo no debe superar 10 MB',
        });
      }
      return res.status(400).json({
        success: false,
        message: err instanceof Error ? err.message : 'Error al procesar el archivo',
      });
    }
    next();
  });
}

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
