import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../config/jwt';
import { ApiError } from './errorHandler';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = (
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
    // Los tokens del portal de clientes se firman con el MISMO secreto que los
    // del equipo; lo único que los distingue es authType. Sin este chequeo un
    // cliente con sesión en el portal entraba a cualquier ruta interna que no
    // tuviera authorize(). Se exige 'internal' explícito: un token sin el
    // campo (o con cualquier otro valor) tampoco pasa. El type 'access' cubre
    // el caso de que algún entorno configure el mismo secreto para ambos
    // tipos: un refresh token no debe servir como llave de las rutas.
    if (decoded.authType !== 'internal' || decoded.type !== 'access') {
      throw new ApiError(401, 'Invalid token type');
    }
    req.user = decoded;
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

export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new ApiError(401, 'Unauthorized');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ApiError(403, 'Forbidden - Insufficient permissions');
    }

    next();
  };
};
