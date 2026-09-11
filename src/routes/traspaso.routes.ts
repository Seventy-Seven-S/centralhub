// src/routes/traspaso.routes.ts — un lote cambia de manos
import { Router } from 'express';
import multer from 'multer';
import traspasoController from '../controllers/traspaso.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { handleMulterUpload } from '../middlewares/handleMulterUpload';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const handleDocumento = handleMulterUpload(upload, 'file');

const router = Router();
router.use(authenticate);

const adminOrManager = authorize('ADMIN', 'MANAGER');

router.get('/',    adminOrManager, traspasoController.listar);
router.post('/',   adminOrManager, handleDocumento, traspasoController.crear);
router.get('/:id', adminOrManager, traspasoController.obtener);

export default router;
