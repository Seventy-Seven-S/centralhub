// src/routes/client.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, authorize } from '../middlewares/auth';
import {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
} from '../controllers/client.controller';

const router = Router();

router.use(authenticate);

const adminOrManager = authorize('ADMIN', 'MANAGER');

router.get('/',    adminOrManager, getAllClients);
router.get('/:id', adminOrManager, getClientById);

router.post(
  '/',
  adminOrManager,
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
  ],
  createClient
);

router.put('/:id',    adminOrManager,        updateClient);
router.delete('/:id', authorize('ADMIN'),     deleteClient);

export default router;
