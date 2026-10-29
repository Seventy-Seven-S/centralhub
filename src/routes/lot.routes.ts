// src/routes/lot.routes.ts
import { Router } from 'express';
import multer from 'multer';
import lotController from '../controllers/lot.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { soloProyectoDelSocio, soloLoteDelSocio } from '../middlewares/alcanceProyectos';
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
// Apartar (no liberar/crear/editar): AGENT puede ejecutar su propio
// apartado — reservedByAgentId se fuerza desde su token en el controller
// (pieza 3), así que abrir esto no reabre el hueco de atribución.
const adminManagerOrAgent = authorize('ADMIN', 'MANAGER', 'AGENT');

// Lectura — los tres roles del equipo ven lotes (el AGENT vive en /lotes).
// Lo que cada uno recibe se recorta en el controller: el AGENT no recibe
// contacto de apartados ajenos ni comprador/saldo de lotes vendidos — ver
// scopeLotPII. Explícito para que un rol nuevo no herede la lectura.
// El SOCIO también ve lotes, solo de sus proyectos, y scopeLotPII le quita
// el comprador y el contacto del apartado igual que al AGENT.
const lectura = authorize('ADMIN', 'MANAGER', 'AGENT', 'SOCIO');
router.get('/',    lectura, soloProyectoDelSocio(), lotController.getAll);
router.get('/:id', lectura, soloLoteDelSocio(), lotController.getById);

// Escritura — solo ADMIN y MANAGER
router.post('/',   adminOrManager, lotController.create);
router.put('/:id', adminOrManager, lotController.update);

// Apartados — reserve abierto a AGENT; liberar sigue solo ADMIN/MANAGER
// (acepta multipart con campo ineFile opcional)
router.post('/:id/reserve',   adminManagerOrAgent, handleIneFile, lotController.reserve);
router.delete('/:id/reserve', adminOrManager, lotController.releaseReservation);

export default router;
