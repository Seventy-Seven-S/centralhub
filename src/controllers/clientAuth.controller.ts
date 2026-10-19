import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import { generateClientAccessToken, generateClientRefreshToken } from '../config/jwt';
import { ApiError, asyncHandler } from '../middlewares/errorHandler';
import { decryptFields, CLIENT_SENSITIVE_FIELDS } from '../utils/fieldCrypto';
import { normalizeEmail } from '../utils/normalizeEmail';

/**
 * Login de cliente
 */
export const loginClient = asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body;
  const email = normalizeEmail(req.body.email);

  // Buscar ClientUser con su Client
  const clientUser = await prisma.clientUser.findUnique({
    where: { email },
    include: { client: true },
  });

  if (!clientUser) {
    throw new ApiError(401, 'Invalid credentials');
  }

  // Verificar contraseña
  const isPasswordValid = await bcrypt.compare(password, clientUser.password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid credentials');
  }

  // Verificar que la cuenta esté activa
  if (clientUser.status !== 'ACTIVE') {
    throw new ApiError(403, 'Account is not active');
  }

  // Generar tokens
  const accessToken = generateClientAccessToken({
    userId: clientUser.id,
    email: clientUser.email,
    clientId: clientUser.client.id,
  });

  const refreshToken = generateClientRefreshToken({
    userId: clientUser.id,
    email: clientUser.email,
    clientId: clientUser.client.id,
  });

  // Guardar refresh token
  await prisma.clientRefreshToken.create({
    data: {
      token: refreshToken,
      clientUserId: clientUser.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // Actualizar último login
  await prisma.clientUser.update({
    where: { id: clientUser.id },
    data: { lastLogin: new Date() },
  });

  res.status(200).json({
    status: 'success',
    data: {
      client: {
        id: clientUser.client.id,
        globalCode: clientUser.client.globalCode,
        firstName: clientUser.client.firstName,
        lastName: clientUser.client.lastName,
        email: clientUser.client.email,
      },
      accessToken,
      refreshToken,
    },
  });
});

/**
 * Obtener perfil del cliente autenticado
 */
export const getClientProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.client) {
    throw new ApiError(401, 'Not authenticated');
  }

  const clientUser = await prisma.clientUser.findUnique({
    where: { id: req.client.userId },
    include: {
      client: {
        include: {
          projects: {
            include: {
              project: true,
            },
          },
          contracts: {
            include: {
              lots: {
                include: {
                  lot: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!clientUser) {
    throw new ApiError(404, 'Client not found');
  }

  res.status(200).json({
    status: 'success',
    data: { client: decryptFields(clientUser.client, [...CLIENT_SENSITIVE_FIELDS]) },
  });
});

/**
 * Lógica testeable de cambio de contraseña.
 *
 * Recibe SIEMPRE el clientUserId derivado del token (nunca del body), de modo
 * que un cliente sólo puede cambiar su propia contraseña. Verifica la
 * contraseña actual con bcrypt.compare; si no coincide lanza 400 con un mensaje
 * genérico ('Contraseña actual incorrecta'). Si coincide, re-hashea la nueva
 * con el mismo factor de coste (10) usado en el resto del módulo y persiste.
 */
export const changeClientPasswordForUser = async (
  clientUserId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const clientUser = await prisma.clientUser.findUnique({
    where: { id: clientUserId },
  });

  if (!clientUser) {
    throw new ApiError(404, 'Client not found');
  }

  const isCurrentValid = await bcrypt.compare(currentPassword, clientUser.password);
  if (!isCurrentValid) {
    throw new ApiError(400, 'Contraseña actual incorrecta');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.clientUser.update({
    where: { id: clientUserId },
    data: { password: hashedPassword },
  });
};

/**
 * Cambiar la contraseña del cliente autenticado (Portal B2C).
 *
 * El id del ClientUser se toma del token verificado (req.client.userId), igual
 * que getClientProfile; nunca de un campo del body, para impedir cambiar la
 * contraseña de otro cliente.
 */
export const changeClientPassword = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ApiError(400, errors.array()[0].msg);
  }

  if (!req.client) {
    throw new ApiError(401, 'Not authenticated');
  }

  const { currentPassword, newPassword } = req.body;

  await changeClientPasswordForUser(req.client.userId, currentPassword, newPassword);

  res.status(200).json({
    success: true,
    message: 'Contraseña actualizada',
  });
});
