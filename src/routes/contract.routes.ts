// src/routes/contract.routes.ts
import { Router } from 'express';
import multer from 'multer';
import contractController from '../controllers/contract.controller';
import cuotaController from '../controllers/cuota.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { handleMulterUpload } from '../middlewares/handleMulterUpload';

// El PDF firmado va al storage PRIVADO (FileStorage), no a /uploads público:
// contiene INE/datos personales. memoryStorage → el controller lo persiste.
// Sin fileFilter: el Content-Type declarado no es confiable (falsificable).
// El tipo real se valida por magic bytes en el controller, una vez que el
// buffer completo está disponible (ver validateFileSignature).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const handleSignedContractFile = handleMulterUpload(upload, 'file');

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
router.post('/:id/upload-signed', adminOrManager, handleSignedContractFile, contractController.uploadSigned);

// Rescisión / cancelación (multipart; `file` opcional = documento de cancelación)
router.post('/:id/rescind',        adminOrManager, handleSignedContractFile, contractController.rescind);
router.get('/:id/rescission-file', adminOrManager, contractController.getRescissionFile);
router.get('/:id/signed-file', adminOrManager, contractController.getSignedFile);

// Cuotas del contrato
router.get('/:id/cuotas', adminOrManager, cuotaController.getByContract.bind(cuotaController));

export default router;
