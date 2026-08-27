import rateLimit from 'express-rate-limit';
import { buildAuthRateLimitKey } from './rateLimitKey';
import { PrismaRateLimitStore } from './rateLimitStore';

const AUTH_WINDOW_MS = 15 * 60 * 1000;

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 100 era muy ajustado para una oficina con varias personas compartiendo
  // IP — uso normal de la app (dashboard, notificaciones, contratos) desde
  // una sola IP agota esto sin que nadie esté haciendo nada indebido.
  max: 1000,
  message: {
    status: 'error',
    statusCode: 429,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Capa 1: identidad compuesta (email normalizado + IP), store persistente en
// Postgres. Protege contra bloqueo dirigido — un atacante que dispare
// intentos fallidos con el email de otra persona no le agota su cupo a ella,
// porque su llave incluye la IP del atacante, no la del dueño de la cuenta.
export const authRateLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: process.env.NODE_ENV === 'production' ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PrismaRateLimitStore(AUTH_WINDOW_MS),
  keyGenerator: (req) => buildAuthRateLimitKey(req.body?.email, req.ip ?? 'unknown'),
  message: {
    status: 'error',
    statusCode: 429,
    message: 'Too many authentication attempts, please try again later.',
  },
});

// Capa 2: solo-IP, independiente de la identidad compuesta. Protege contra
// spray entre cuentas conocidas (una sola IP probando muchos emails
// distintos, pocos intentos cada uno, para evadir la capa 1). Más holgado
// que la capa 1 para no bloquear una oficina compartiendo IP en uso normal.
export const authIpRateLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: process.env.NODE_ENV === 'production' ? 150 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PrismaRateLimitStore(AUTH_WINDOW_MS),
  message: {
    status: 'error',
    statusCode: 429,
    message: 'Too many authentication attempts from this IP, please try again later.',
  },
});
