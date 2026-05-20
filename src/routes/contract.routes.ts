// src/routes/contract.routes.ts
import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import contractController from '../controllers/contract.controller';
import cuotaController from '../controllers/cuota.controller';
import { authenticate, authorize } from '../middlewares/auth';

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/contratos'),
  filename: (_req, file, cb) => {
    const contractId = (_req as any).params.id;
    cb(null, `${contractId}-signed.pdf`);
  },
});

const upload = multer({
  storage,
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

// Co-titulares
router.post('/:id/coowners', adminOrManager, contractController.addCoOwner);

// Upload contrato firmado
router.post('/:id/upload-signed', adminOrManager, upload.single('file'), contractController.uploadSigned);

// Cuotas del contrato
router.get('/:id/cuotas', adminOrManager, cuotaController.getByContract.bind(cuotaController));

export default router;
