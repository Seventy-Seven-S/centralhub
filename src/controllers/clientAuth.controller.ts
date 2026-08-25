import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import { generateClientAccessToken, generateClientRefreshToken } from '../config/jwt';
import { ApiError, asyncHandler } from '../middlewares/errorHandler';
import { encryptFields, decryptFields, CLIENT_SENSITIVE_FIELDS } from '../utils/fieldCrypto';
import { normalizeEmail } from '../utils/normalizeEmail';

/**
 * Registro de cliente con acceso al portal
 * Crea tanto el Client como el ClientUser
 */
export const registerClient = asyncHandler(async (req: Request, res: Response) => {
  const {
    // Datos del cliente
    firstName,
    lastName,
    phone,
    password,
    // Opcional: datos adicionales
    address,
    city,
    state,
    zipCode,
    ine,
    curp,
    estadoCivil,
    lugarNacimiento,
    // Proyecto inicial (opcional)
    projectId,
    projectCode,
  } = req.body;
  const email = normalizeEmail(req.body.email);

  // Verificar si el email ya está en uso
  const existingClientUser = await prisma.clientUser.findUnique({
    where: { email },
  });

  if (existingClientUser) {
    throw new ApiError(400, 'Email already registered');
  }

  // Generar código global único
  const lastClient = await prisma.client.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  let nextNumber = 1;
  if (lastClient) {
    const lastNumber = parseInt(lastClient.globalCode.split('-')[1]);
    nextNumber = lastNumber + 1;
  }

  const globalCode = `CLI-${String(nextNumber).padStart(6, '0')}`;

  // Hash de la contraseña
  const hashedPassword = await bcrypt.hash(password, 10);

  // Crear cliente + usuario en una transacción
  const result = await prisma.$transaction(async (tx) => {
    // 1. Crear el Client
    const client = await tx.client.create({
      data: {
        globalCode,
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        state,
        zipCode,
        // Cifrado en reposo (AES-256-GCM) de los campos sensibles
        ...encryptFields({ ine, curp, estadoCivil, lugarNacimiento }, [...CLIENT_SENSITIVE_FIELDS]),
        status: 'ACTIVE',
      },
    });

    // 2. Crear el ClientUser (acceso al portal)
    const clientUser = await tx.clientUser.create({
      data: {
        clientId: client.id,
        email,
        password: hashedPassword,
        status: 'ACTIVE',
      },
    });

    // 3. Si viene projectId, crear la relación
    if (projectId) {
      await tx.clientProject.create({
        data: {
          clientId: client.id,
          projectId,
          projectCode: projectCode || 'N/A',
        },
      });
    }

    return { client, clientUser };
  });

  // Generar tokens
  const accessToken = generateClientAccessToken({
    userId: result.clientUser.id,
    email: result.clientUser.email,
    clientId: result.client.id,
  });

  const refreshToken = generateClientRefreshToken({
    userId: result.clientUser.id,
    email: result.clientUser.email,
    clientId: result.client.id,
  });

  // Guardar refresh token
  await prisma.clientRefreshToken.create({
    data: {
      token: refreshToken,
      clientUserId: result.clientUser.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  res.status(201).json({
    status: 'success',
    data: {
      client: {
        id: result.client.id,
        globalCode: result.client.globalCode,
        firstName: result.client.firstName,
        lastName: result.client.lastName,
        email: result.client.email,
      },
      accessToken,
      refreshToken,
    },
  });
});

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
