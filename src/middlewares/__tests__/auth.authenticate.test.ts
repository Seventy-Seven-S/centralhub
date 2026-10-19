import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { authenticate } from '../auth';
import {
  generateAccessToken,
  generateRefreshToken,
  generateClientAccessToken,
  jwtConfig,
} from '../../config/jwt';

// Tokens reales firmados con los helpers de config/jwt: lo que se prueba es
// que authenticate distinga equipo de portal aunque compartan secreto.
function run(token: string | undefined) {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} } as unknown as Request;
  const next = vi.fn();
  authenticate(req, {} as Response, next);
  return { req, next };
}

const EQUIPO = { userId: 'user-1', email: 'secretaria@centralinmob.com', role: 'MANAGER' };

describe('authenticate — solo tokens del equipo', () => {
  it('access token del equipo → pasa y deja req.user', () => {
    const { req, next } = run(generateAccessToken(EQUIPO));
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({ userId: 'user-1', role: 'MANAGER', authType: 'internal' });
  });

  it('access token del PORTAL de clientes (mismo secreto) → 401, sin req.user', () => {
    const token = generateClientAccessToken({ userId: 'cu-1', email: 'cliente@gmail.com', clientId: 'cl-1' });
    const { req, next } = run(token);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
    expect(req.user).toBeUndefined();
  });

  it('token firmado con el secreto bueno pero SIN authType → 401 (se exige internal explícito)', () => {
    const token = jwt.sign({ ...EQUIPO, type: 'access' }, jwtConfig.secret);
    const { next } = run(token);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });

  it('refresh token usado como access (aunque compartiera secreto) → 401', () => {
    const token = jwt.sign({ ...EQUIPO, type: 'refresh', authType: 'internal' }, jwtConfig.secret);
    const { next } = run(token);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });

  it('refresh token real (otro secreto) → 401', () => {
    const { next } = run(generateRefreshToken(EQUIPO));
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });

  it('sin header → 401', () => {
    const { next } = run(undefined);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });
});
