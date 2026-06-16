// src/routes/commission.routes.ts
import { Router } from 'express';
import commissionController from '../controllers/commission.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

const adminOrManager = authorize('ADMIN', 'MANAGER');

router.use(authenticate);

router.get('/',          adminOrManager, commissionController.getAll);
router.patch('/:id/pay', adminOrManager, commissionController.pay);

export default router;
