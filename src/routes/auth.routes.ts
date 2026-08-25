import { Router } from 'express';
import { body } from 'express-validator';
import { authRateLimiter, authIpRateLimiter } from '../middlewares/rateLimiter';
import { authenticate, authorize } from '../middlewares/auth';
import { register, login, verify2fa, refresh, logout } from '../controllers/auth.controller';

const router = Router();

// Crear usuarios del equipo es privilegio del ADMIN — sin esto cualquiera
// podría auto-registrarse (incluso con rol ADMIN) en producción.
router.post(
  '/register',
  authenticate,
  authorize('ADMIN'),
  authIpRateLimiter,
  authRateLimiter,
  [
    body('email').trim().isEmail().withMessage('Valid email is required'),
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
  authIpRateLimiter,
  authRateLimiter,
  [
    body('email').trim().isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  login
);

router.post(
  '/verify-2fa',
  authIpRateLimiter,
  authRateLimiter,
  [
    body('email').trim().isEmail(),
    body('code').isLength({ min: 6, max: 6 }).isNumeric(),
  ],
  verify2fa
);

// Sin authRateLimiter/authIpRateLimiter a propósito: es tráfico legítimo y
// frecuente (una renovación silenciosa por sesión activa), no un intento de
// credenciales — cae solo bajo el rate-limiter global de la app.
router.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('refreshToken is required')],
  refresh
);

router.post(
  '/logout',
  [body('refreshToken').notEmpty().withMessage('refreshToken is required')],
  logout
);

export default router;
