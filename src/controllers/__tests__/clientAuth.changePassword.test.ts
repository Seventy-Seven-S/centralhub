import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma = {
    clientUser: { findUnique: vi.fn(), update: vi.fn() },
  };
  const bcrypt = { compare: vi.fn(), hash: vi.fn() };
  return { prisma, bcrypt };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));
vi.mock('bcrypt', () => ({ default: mocks.bcrypt }));

import { changeClientPasswordForUser } from '../clientAuth.controller';
import { ApiError } from '../../middlewares/errorHandler';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.clientUser.findUnique.mockResolvedValue({
    id: 'cu-1',
    password: 'hashed-current',
  });
  mocks.prisma.clientUser.update.mockResolvedValue({ id: 'cu-1' });
});

describe('changeClientPasswordForUser', () => {
  it('contraseña actual incorrecta → lanza 400 y NO actualiza', async () => {
    mocks.bcrypt.compare.mockResolvedValue(false);

    await expect(
      changeClientPasswordForUser('cu-1', 'wrong', 'newpassword123')
    ).rejects.toMatchObject({ statusCode: 400, message: 'Contraseña actual incorrecta' });

    expect(mocks.bcrypt.compare).toHaveBeenCalledWith('wrong', 'hashed-current');
    expect(mocks.bcrypt.hash).not.toHaveBeenCalled();
    expect(mocks.prisma.clientUser.update).not.toHaveBeenCalled();
  });

  it('contraseña actual correcta → hashea la nueva y actualiza SOLO ese usuario', async () => {
    mocks.bcrypt.compare.mockResolvedValue(true);
    mocks.bcrypt.hash.mockResolvedValue('hashed-new');

    await changeClientPasswordForUser('cu-1', 'current', 'newpassword123');

    expect(mocks.bcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
    expect(mocks.prisma.clientUser.update).toHaveBeenCalledWith({
      where: { id: 'cu-1' },
      data: { password: 'hashed-new' },
    });
  });

  it('usuario inexistente → lanza 404 y no compara ni actualiza', async () => {
    mocks.prisma.clientUser.findUnique.mockResolvedValue(null);

    await expect(
      changeClientPasswordForUser('ghost', 'x', 'newpassword123')
    ).rejects.toBeInstanceOf(ApiError);

    expect(mocks.bcrypt.compare).not.toHaveBeenCalled();
    expect(mocks.prisma.clientUser.update).not.toHaveBeenCalled();
  });
});
