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

router.get('/', authenticate, getAllClients);
router.get('/:id', authenticate, getClientById);

router.post(
  '/',
  authenticate,
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
  ],
  createClient
);

router.put('/:id', authenticate, updateClient);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteClient);

export default router;
