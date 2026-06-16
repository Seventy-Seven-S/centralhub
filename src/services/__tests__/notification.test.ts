import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma = {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return { prisma };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  NotificationType: { RESERVATION: 'RESERVATION', CONTRACT: 'CONTRACT', PAYMENT: 'PAYMENT' },
}));

import notificationService from '../notification.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createNotification', () => {
  it('crea la fila con los campos correctos', async () => {
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
      },
    });
  });

  it('usa null cuando no se pasan relatedEntity/relatedEntityId', async () => {
    mocks.prisma.notification.create.mockResolvedValue({ id: 'n-2' });

    await notificationService.createNotification({
      type: 'PAYMENT',
      message: 'Pago registrado: 1000 — Ana',
    });

    expect(mocks.prisma.notification.create).toHaveBeenCalledWith({
      data: {
        type: 'PAYMENT',
        message: 'Pago registrado: 1000 — Ana',
        relatedEntity: null,
        relatedEntityId: null,
      },
    });
  });
});

describe('getNotifications', () => {
  it('devuelve las últimas 50 (desc) + unreadCount', async () => {
    const rows = [{ id: 'n-1' }, { id: 'n-2' }];
    mocks.prisma.notification.findMany.mockResolvedValue(rows);
    mocks.prisma.notification.count.mockResolvedValue(3);

    const result = await notificationService.getNotifications();

    expect(result).toEqual({ notifications: rows, unreadCount: 3 });
    expect(mocks.prisma.notification.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    expect(mocks.prisma.notification.count).toHaveBeenCalledWith({ where: { read: false } });
  });
});

describe('markRead', () => {
  it('marca una notificación como leída', async () => {
    mocks.prisma.notification.update.mockResolvedValue({ id: 'n-1', read: true });

    await notificationService.markRead('n-1');

    expect(mocks.prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: { read: true },
    });
  });
});

describe('markAllRead', () => {
  it('marca todas las no leídas como leídas', async () => {
    mocks.prisma.notification.updateMany.mockResolvedValue({ count: 5 });

    const result = await notificationService.markAllRead();

    expect(result).toEqual({ count: 5 });
    expect(mocks.prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { read: false },
      data: { read: true },
    });
  });
});
