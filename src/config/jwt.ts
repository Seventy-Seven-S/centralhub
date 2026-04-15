import jwt, { SignOptions } from 'jsonwebtoken';

export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'your-secret-key',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
  expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
};

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
  authType: 'internal' | 'client'; // NUEVO: Diferencia entre equipo interno y clientes
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

  const options: SignOptions = { expiresIn: jwtConfig.expiresIn };
  return jwt.sign(signPayload, jwtConfig.secret, options);
};

export const generateRefreshToken = (payload: Omit<JwtPayload, 'type' | 'authType'>): string => {
  const signPayload: JwtPayload = {
    ...payload,
    type: 'refresh',
    authType: 'internal',
  };

  const options: SignOptions = { expiresIn: jwtConfig.refreshExpiresIn };
  return jwt.sign(signPayload, jwtConfig.refreshSecret, options);
};

// ============================================================================
// AUTENTICACIÓN CLIENTES (Portal B2C)
// ============================================================================

export const generateClientAccessToken = (payload: { userId: string; email: string; clientId: string }): string => {
  const signPayload: JwtPayload = {
    userId: payload.userId,
    email: payload.email,
    role: 'CLIENT', // Los clientes tienen un rol especial
    type: 'access',
    authType: 'client',
  };

  const options: SignOptions = { expiresIn: jwtConfig.expiresIn };
  return jwt.sign(signPayload, jwtConfig.secret, options);
};

export const generateClientRefreshToken = (payload: { userId: string; email: string; clientId: string }): string => {
  const signPayload: JwtPayload = {
    userId: payload.userId,
    email: payload.email,
    role: 'CLIENT',
    type: 'refresh',
    authType: 'client',
  };

  const options: SignOptions = { expiresIn: jwtConfig.refreshExpiresIn };
  return jwt.sign(signPayload, jwtConfig.refreshSecret, options);
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
