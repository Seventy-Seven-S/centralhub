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
  type?: 'access' | 'refresh';
}

export const generateAccessToken = (payload: Omit<JwtPayload, 'type'>): string => {
  const signPayload: JwtPayload = { ...payload, type: 'access' };
  const options: SignOptions = { expiresIn: jwtConfig.expiresIn };
  return jwt.sign(signPayload, jwtConfig.secret, options);
};

export const generateRefreshToken = (payload: Omit<JwtPayload, 'type'>): string => {
  const signPayload: JwtPayload = { ...payload, type: 'refresh' };
  const options: SignOptions = { expiresIn: jwtConfig.refreshExpiresIn };
  return jwt.sign(signPayload, jwtConfig.refreshSecret, options);
};

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, jwtConfig.secret) as JwtPayload;
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, jwtConfig.refreshSecret) as JwtPayload;
};
