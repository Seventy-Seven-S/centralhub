import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, refreshTokenTtlMs } from '../config/jwt';
import { ApiError, asyncHandler } from '../middlewares/errorHandler';
import { sendVerificationCode } from '../services/email.service';
import { EmailSendError } from '../utils/errors';

function persistRefreshToken(userId: string, token: string) {
  return prisma.refreshToken.create({
    data: { token, userId, expiresAt: new Date(Date.now() + refreshTokenTtlMs) },
  });
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, firstName, lastName, role } = req.body;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new ApiError(400, 'Email already registered');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: role || 'AGENT',
    },
  });

  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  const refreshToken = generateRefreshToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  await persistRefreshToken(user.id, refreshToken);

  res.status(201).json({
    status: 'success',
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      accessToken,
      refreshToken,
    },
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError(401, 'Invalid credentials');

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) throw new ApiError(401, 'Invalid credentials');

  if (user.status !== 'ACTIVE') throw new ApiError(403, 'Account is not active');

  if (process.env.NODE_ENV === 'development') {
    const payload = { userId: user.id, email: user.email, role: user.role };
    const accessToken  = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    await persistRefreshToken(user.id, refreshToken);
    return res.status(200).json({
      status: 'success',
      data: { accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName } }
    });
  }

  // Flujo 2FA normal (producción)
  const code       = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedCode = await bcrypt.hash(code, 10);
  const expiry     = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.user.update({
    where: { id: user.id },
    data:  { twoFactorCode: hashedCode, twoFactorExpiry: expiry },
  });
  try {
    await sendVerificationCode(user.email, user.firstName, code);
  } catch (err) {
    // Credenciales ya se validaron arriba — no hay riesgo de filtrar
    // información distinguiendo este error del de credenciales inválidas.
    // El detalle real de Resend ya quedó en logs (email.service.ts); aquí
    // solo un mensaje genérico y accionable, nunca el error interno.
    if (err instanceof EmailSendError) {
      throw new ApiError(502, 'No se pudo enviar el código de verificación. Contacta al administrador.');
    }
    throw err;
  }
  res.status(200).json({ status: 'pending_2fa', data: { email: user.email } });
});

export const verify2fa = asyncHandler(async (req: Request, res: Response) => {
  const { email, code } = req.body;
  if (!email || !code) throw new ApiError(400, 'Email and code are required');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.twoFactorCode || !user.twoFactorExpiry)
    throw new ApiError(400, 'No pending verification for this email');

  if (new Date() > user.twoFactorExpiry)
    throw new ApiError(400, 'Verification code has expired');

  const isValid = await bcrypt.compare(code, user.twoFactorCode);
  if (!isValid) throw new ApiError(400, 'Invalid verification code');

  await prisma.user.update({
    where: { id: user.id },
    data:  { twoFactorCode: null, twoFactorExpiry: null, lastLogin: new Date() },
  });

  const accessToken  = generateAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role });

  await persistRefreshToken(user.id, refreshToken);

  res.status(200).json({
    status: 'success',
    data: {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
      accessToken,
      refreshToken,
    },
  });
});

// POST /auth/refresh — renueva la sesión de forma transparente. Rota SIEMPRE:
// la fila vieja se borra y se crea una nueva, así un refresh token robado
// deja de servir en cuanto el usuario legítimo haga su siguiente refresh
// (ventana de minutos, no las 24h completas de vida del token).
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new ApiError(400, 'refreshToken is required');

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  await prisma.refreshToken.delete({ where: { token: refreshToken } });

  const newPayload = { userId: payload.userId, email: payload.email, role: payload.role };
  const accessToken = generateAccessToken(newPayload);
  const newRefreshToken = generateRefreshToken(newPayload);
  await persistRefreshToken(payload.userId, newRefreshToken);

  res.status(200).json({
    status: 'success',
    data: { accessToken, refreshToken: newRefreshToken },
  });
});

// POST /auth/logout — invalida el refresh token en BD. Idempotente: si ya no
// existe (doble logout, o ya rotado), igual responde 200 — la intención del
// caller es "asegúrate de que esté muerto", y ya lo está.
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new ApiError(400, 'refreshToken is required');

  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });

  res.status(200).json({ status: 'success' });
});
