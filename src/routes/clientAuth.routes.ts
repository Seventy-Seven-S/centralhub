import { Router } from 'express';
import { body } from 'express-validator';
import { authRateLimiter, authIpRateLimiter } from '../middlewares/rateLimiter';
import { authenticateClient } from '../middlewares/clientAuth';
import {
  loginClient,
  getClientProfile,
  changeClientPassword,
} from '../controllers/clientAuth.controller';

const router = Router();

// Sin registro público: la cuenta del portal se crea cuando el equipo da de
// alta el contrato del cliente. Un /register abierto dejaba a cualquiera
// fabricarse un Client y un acceso al portal.

/**
 * @route   POST /api/v1/client-auth/login
 * @desc    Login de cliente
 * @access  Public
 */
router.post(
  '/login',
  authIpRateLimiter,
  authRateLimiter,
  [
    body('email').trim().isEmail().withMessage('Valid email is required'),
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

/**
 * @route   POST /api/v1/client-auth/change-password
 * @desc    Cambiar la contraseña del cliente autenticado
 * @access  Private (Cliente)
 */
router.post(
  '/change-password',
  authIpRateLimiter,
  authRateLimiter,
  authenticateClient,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters long'),
  ],
  changeClientPassword
);

export default router;
