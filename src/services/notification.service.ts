// src/services/notification.service.ts
// Buzón de notificaciones in-app. Solo el ADMIN las consume.
import { PrismaClient, NotificationType } from '@prisma/client';

const prisma = new PrismaClient();

// Cuántas notificaciones devuelve getNotifications (las más recientes).
const MAX_NOTIFICATIONS = 50;

export interface CreateNotificationInput {
  type: NotificationType;
  message: string;
  relatedEntity?: string;
  relatedEntityId?: string;
}

export class NotificationService {
  // Crea una notificación. Helper simple usado por los triggers fire-and-forget.
  async createNotification(input: CreateNotificationInput) {
    return prisma.notification.create({
      data: {
        type: input.type,
        message: input.message,
        relatedEntity: input.relatedEntity ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
      },
    });
  }

  // Últimas ~50 notificaciones (más recientes primero) + conteo de no leídas.
  async getNotifications() {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        orderBy: { createdAt: 'desc' },
        take: MAX_NOTIFICATIONS,
      }),
      prisma.notification.count({ where: { read: false } }),
    ]);

    return { notifications, unreadCount };
  }

  // Marca una notificación como leída.
  async markRead(id: string) {
    return prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  // Marca todas las notificaciones no leídas como leídas.
  async markAllRead() {
    return prisma.notification.updateMany({
      where: { read: false },
      data: { read: true },
    });
  }
}

export default new NotificationService();
