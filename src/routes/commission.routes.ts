// src/routes/commission.routes.ts
import { Router } from 'express';
import commissionController from '../controllers/commission.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

const adminOrManager = authorize('ADMIN', 'MANAGER');
// El AGENT puede LEER comisiones (el controller lo limita a las suyas);
// marcar pagada sigue siendo de ADMIN/MANAGER.
const staffAll = authorize('ADMIN', 'MANAGER', 'AGENT');

router.use(authenticate);

router.get('/',          staffAll,       commissionController.getAll);
router.patch('/:id/pay', adminOrManager, commissionController.pay);

export default router;
