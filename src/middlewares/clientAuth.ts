import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../config/jwt';
import { ApiError } from './errorHandler';

declare global {
  namespace Express {
    interface Request {
      client?: JwtPayload;
    }
  }
}

/**
 * Middleware de autenticación para CLIENTES (Portal B2C)
 */
export const authenticateClient = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'No token provided');
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    // Verificar que sea un token de cliente
    if (decoded.authType !== 'client') {
      throw new ApiError(403, 'Invalid token type - client token required');
    }

    req.client = decoded;
    next();
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TokenExpiredError') {
        next(new ApiError(401, 'Token expired'));
      } else if (error.name === 'JsonWebTokenError') {
        next(new ApiError(401, 'Invalid token'));
      } else {
        next(error);
      }
    } else {
      next(new ApiError(401, 'Authentication failed'));
    }
  }
};
