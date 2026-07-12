import { Router } from 'express';
import { body } from 'express-validator';
import { authRateLimiter } from '../middlewares/rateLimiter';
import { authenticate, authorize } from '../middlewares/auth';
import { register, login, verify2fa } from '../controllers/auth.controller';

const router = Router();

// Crear usuarios del equipo es privilegio del ADMIN — sin esto cualquiera
// podría auto-registrarse (incluso con rol ADMIN) en producción.
router.post(
  '/register',
  authenticate,
  authorize('ADMIN'),
  authRateLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long'),
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
  ],
  register
);

router.post(
  '/login',
  authRateLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  login
);

router.post(
  '/verify-2fa',
  authRateLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('code').isLength({ min: 6, max: 6 }).isNumeric(),
  ],
  verify2fa
);

export default router;
