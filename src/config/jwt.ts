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

export const jwtConfig = {
  secret: requireSecret('JWT_SECRET', 'dev-only-secret'),
  refreshSecret: requireSecret('JWT_REFRESH_SECRET', 'dev-only-refresh-secret'),
  expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
};

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