import jwt from 'jsonwebtoken';

// En producción los secretos son OBLIGATORIOS: sin fallback silencioso
// (el viejo 'your-secret-key' permitía forjar tokens si faltaba el env).
function requireSecret(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET', devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} es obligatorio en producción — configúralo en las variables de entorno`);
  }
  return devFallback;
}

// Duración del refresh token: fuente única. El default es una jornada
// laboral (24h) — decisión de negocio tras el incidente de logout cada 15
// min en la demo. jsonwebtoken firma con el string ('24h'); la fila de
// RefreshToken en BD necesita el mismo valor en ms para expiresAt — antes
// había dos fuentes de verdad (este string y un "7 días" hardcodeado en el
// controller) que podían desincronizarse.
const REFRESH_UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const DEFAULT_REFRESH_EXPIRES_IN = '24h';

function resolveRefreshExpiresIn(): string {
  return process.env.JWT_REFRESH_EXPIRES_IN || DEFAULT_REFRESH_EXPIRES_IN;
}

function resolveRefreshTokenTtlMs(raw: string): number {
  const match = /^(\d+)([smhd])$/.exec(raw);
  if (!match) return REFRESH_UNIT_MS.h * 24; // fallback: 24h
  return Number(match[1]) * REFRESH_UNIT_MS[match[2]];
}

export const jwtConfig = {
  secret: requireSecret('JWT_SECRET', 'dev-only-secret'),
  refreshSecret: requireSecret('JWT_REFRESH_SECRET', 'dev-only-refresh-secret'),
  expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshExpiresIn: resolveRefreshExpiresIn(),
};

export const refreshTokenTtlMs = resolveRefreshTokenTtlMs(jwtConfig.refreshExpiresIn);

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
  authType: 'internal' | 'client';
}

// ============================================================================
// AUTENTICACIÓN INTERNA (Equipo)
// ============================================================================

export const generateAccessToken = (payload: Omit<JwtPayload, 'type' | 'authType'>): string => {
  const signPayload: JwtPayload = {
    ...payload,
    type: 'access',
    authType: 'internal',
  };

  // @ts-ignore - Known type issue with jsonwebtoken
  return jwt.sign(signPayload, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn });
};

export const generateRefreshToken = (payload: Omit<JwtPayload, 'type' | 'authType'>): string => {
  const signPayload: JwtPayload = {
    ...payload,
    type: 'refresh',
    authType: 'internal',
  };

  // @ts-ignore - Known type issue with jsonwebtoken
  return jwt.sign(signPayload, jwtConfig.refreshSecret, { expiresIn: jwtConfig.refreshExpiresIn });
};

// ============================================================================
// AUTENTICACIÓN CLIENTES (Portal B2C)
// ============================================================================

export const generateClientAccessToken = (payload: { userId: string; email: string; clientId: string }): string => {
  const signPayload: JwtPayload = {
    userId: payload.userId,
    email: payload.email,
    role: 'CLIENT',
    type: 'access',
    authType: 'client',
  };

  // @ts-ignore - Known type issue with jsonwebtoken
  return jwt.sign(signPayload, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn });
};

export const generateClientRefreshToken = (payload: { userId: string; email: string; clientId: string }): string => {
  const signPayload: JwtPayload = {
    userId: payload.userId,
    email: payload.email,
    role: 'CLIENT',
    type: 'refresh',
    authType: 'client',
  };

  // @ts-ignore - Known type issue with jsonwebtoken
  return jwt.sign(signPayload, jwtConfig.refreshSecret, { expiresIn: jwtConfig.refreshExpiresIn });
};

// ============================================================================
// VERIFICACIÓN
// ============================================================================

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, jwtConfig.secret) as JwtPayload;
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, jwtConfig.refreshSecret) as JwtPayload;
};

export const decodeToken = (token: string): JwtPayload | null => {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch (error) {
    return null;
  }
};