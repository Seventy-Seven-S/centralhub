import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma = {
    notification: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return { prisma };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  NotificationType: { RESERVATION: 'RESERVATION', CONTRACT: 'CONTRACT', PAYMENT: 'PAYMENT' },
  NotificationAudience: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', CLIENT: 'CLIENT' },
}));

import notificationService from '../notification.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createNotification', () => {
  it('crea la fila con audiencia ADMIN por defecto', async () => {
    mocks.prisma.notification.create.mockResolvedValue({ id: 'n-1' });

    await notificationService.createNotification({
      type: 'RESERVATION',
      message: 'Nuevo apartado: lote 5 M2 — Juan Pérez',
      relatedEntity: 'lot',
      relatedEntityId: 'lot-1',
    });

    expect(mocks.prisma.notification.create).toHaveBeenCalledWith({
      data: {
        type: 'RESERVATION',
        message: 'Nuevo apartado: lote 5 M2 — Juan Pérez',
        relatedEntity: 'lot',
        relatedEntityId: 'lot-1',
        audience: 'ADMIN',
        clientId: null,
      },
    });
  });

  it('crea notificación de CLIENTE con su clientId', async () => {
    mocks.prisma.notification.create.mockResolvedValue({ id: 'n-2' });

    await notificationService.createNotification({
      type: 'PAYMENT',
      message: 'Tu pago de $3,500 fue registrado',
      audience: 'CLIENT',
      clientId: 'cli-9',
    });

    expect(mocks.prisma.notification.create).toHaveBeenCalledWith({
      data: {
        type: 'PAYMENT',
        message: 'Tu pago de $3,500 fue registrado',
        relatedEntity: null,
        relatedEntityId: null,
        audience: 'CLIENT',
        clientId: 'cli-9',
      },
    });
  });
});

describe('createForAudiences', () => {
  it('crea una fila por audiencia (ADMIN copia de todo + MANAGER)', async () => {
    mocks.prisma.notification.createMany.mockResolvedValue({ count: 2 });

    await notificationService.createForAudiences(
      { type: 'RESERVATION', message: 'Nuevo apartado', relatedEntity: 'lot', relatedEntityId: 'lot-1' },
      ['ADMIN', 'MANAGER'],
    );

    expect(mocks.prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        { type: 'RESERVATION', message: 'Nuevo apartado', relatedEntity: 'lot', relatedEntityId: 'lot-1', audience: 'ADMIN', clientId: null },
        { type: 'RESERVATION', message: 'Nuevo apartado', relatedEntity: 'lot', relatedEntityId: 'lot-1', audience: 'MANAGER', clientId: null },
      ],
    });
  });
});

describe('getNotifications', () => {
  it('filtra por audiencia del staff', async () => {
    mocks.prisma.notification.findMany.mockResolvedValue([]);
    mocks.prisma.notification.count.mockResolvedValue(0);

    await notificationService.getNotifications('MANAGER');

    expect(mocks.prisma.notification.findMany).toHaveBeenCalledWith({
      where: { audience: 'MANAGER' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    expect(mocks.prisma.notification.count).toHaveBeenCalledWith({
      where: { audience: 'MANAGER', read: false },
    });
  });

  it('para CLIENT exige y filtra por clientId', async () => {
    mocks.prisma.notification.findMany.mockResolvedValue([]);
    mocks.prisma.notification.count.mockResolvedValue(0);

    await notificationService.getNotifications('CLIENT', 'cli-9');

    expect(mocks.prisma.notification.findMany).toHaveBeenCalledWith({
      where: { audience: 'CLIENT', clientId: 'cli-9' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });

  it('CLIENT sin clientId lanza error (nunca devolver el stream completo)', async () => {
    await expect(notificationService.getNotifications('CLIENT')).rejects.toThrow();
  });
});

describe('markRead', () => {
  it('solo marca si la notificación pertenece a la audiencia del solicitante', async () => {
    mocks.prisma.notification.updateMany.mockResolvedValue({ count: 1 });

    await notificationService.markRead('n-1', 'MANAGER');

    expect(mocks.prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n-1', audience: 'MANAGER' },
      data: { read: true },
    });
  });

  it('para CLIENT también exige coincidencia de clientId', async () => {
    mocks.prisma.notification.updateMany.mockResolvedValue({ count: 1 });

    await notificationService.markRead('n-1', 'CLIENT', 'cli-9');

    expect(mocks.prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n-1', audience: 'CLIENT', clientId: 'cli-9' },
      data: { read: true },
    });
  });
});

describe('markAllRead', () => {
  it('marca solo las de la audiencia del solicitante', async () => {
    mocks.prisma.notification.updateMany.mockResolvedValue({ count: 3 });

    await notificationService.markAllRead('ADMIN');

    expect(mocks.prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { audience: 'ADMIN', read: false },
      data: { read: true },
    });
  });

  it('para CLIENT marca solo las suyas', async () => {
    mocks.prisma.notification.updateMany.mockResolvedValue({ count: 1 });

    await notificationService.markAllRead('CLIENT', 'cli-9');

    expect(mocks.prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { audience: 'CLIENT', clientId: 'cli-9', read: false },
      data: { read: true },
    });
  });
});
