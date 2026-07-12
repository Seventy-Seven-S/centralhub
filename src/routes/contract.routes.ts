// src/routes/contract.routes.ts
import { Router } from 'express';
import multer from 'multer';
import contractController from '../controllers/contract.controller';
import cuotaController from '../controllers/cuota.controller';
import { authenticate, authorize } from '../middlewares/auth';

// El PDF firmado va al storage PRIVADO (FileStorage), no a /uploads público:
// contiene INE/datos personales. memoryStorage → el controller lo persiste.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo se aceptan archivos PDF'));
  },
});

const router = Router();

router.use(authenticate);

const adminOrManager = authorize('ADMIN', 'MANAGER');

// CRUD de contratos
router.post('/',    adminOrManager, contractController.create);
router.get('/',     adminOrManager, contractController.getAll);
router.get('/:id',  adminOrManager, contractController.getById);
router.put('/:id',  adminOrManager, contractController.update);

// Activación manual de contrato (sin PDF firmado)
router.patch('/:id/activate', adminOrManager, contractController.activate);

// Co-titulares
router.post('/:id/coowners', adminOrManager, contractController.addCoOwner);

// Upload contrato firmado
router.post('/:id/upload-signed', adminOrManager, upload.single('file'), contractController.uploadSigned);
router.get('/:id/signed-file', adminOrManager, contractController.getSignedFile);

// Cuotas del contrato
router.get('/:id/cuotas', adminOrManager, cuotaController.getByContract.bind(cuotaController));

export default router;
