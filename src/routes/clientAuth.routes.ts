import { Router } from 'express';
import { body } from 'express-validator';
import { authRateLimiter } from '../middlewares/rateLimiter';
import { authenticateClient } from '../middlewares/clientAuth';
import {
  registerClient,
  loginClient,
  getClientProfile,
} from '../controllers/clientAuth.controller';

const router = Router();

/**
 * @route   POST /api/v1/client-auth/register
 * @desc    Registrar cliente con acceso al portal
 * @access  Public
 */
router.post(
  '/register',
  authRateLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long'),
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
  ],
  registerClient
);

/**
 * @route   POST /api/v1/client-auth/login
 * @desc    Login de cliente
 * @access  Public
 */
router.post(
  '/login',
  authRateLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  loginClient
);

/**
 * @route   GET /api/v1/client-auth/profile
 * @desc    Obtener perfil del cliente autenticado
 * @access  Private (Cliente)
 */
router.get('/profile', authenticateClient, getClientProfile);

export default router;
