// src/services/notification.service.ts
// Buzón de notificaciones in-app, dirigido por audiencia:
//   ADMIN   — "copia de todo": recibe una fila por CADA evento del sistema
//   MANAGER — operación de ventanilla (nuevos apartados)
//   CLIENT  — notificaciones personales del portal (sus pagos), con clientId
// Se crea UNA FILA POR AUDIENCIA para que el estado de leído sea independiente.
import { PrismaClient, NotificationType, NotificationAudience } from '@prisma/client';

const prisma = new PrismaClient();

// Cuántas notificaciones devuelve getNotifications (las más recientes).
const MAX_NOTIFICATIONS = 50;

export interface CreateNotificationInput {
  type: NotificationType;
  message: string;
  relatedEntity?: string;
  relatedEntityId?: string;
  audience?: NotificationAudience;
  clientId?: string;
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
        audience: input.audience ?? 'ADMIN',
        clientId: input.clientId ?? null,
      },
    });
  }

  // Crea la misma notificación para varias audiencias de staff (fan-out).
  // Los llamadores incluyen ADMIN en cada evento ("copia de todo").
  async createForAudiences(
    input: Omit<CreateNotificationInput, 'audience' | 'clientId'>,
    audiences: NotificationAudience[],
  ) {
    return prisma.notification.createMany({
      data: audiences.map(audience => ({
        type: input.type,
        message: input.message,
        relatedEntity: input.relatedEntity ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        audience,
        clientId: null,
      })),
    });
  }

  // Últimas ~50 notificaciones de la audiencia (más recientes primero) + no leídas.
  // Para CLIENT el clientId es obligatorio: jamás devolver el stream completo.
  async getNotifications(audience: NotificationAudience, clientId?: string) {
    const where = this.scopeWhere(audience, clientId);
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: MAX_NOTIFICATIONS,
      }),
      prisma.notification.count({ where: { ...where, read: false } }),
    ]);

    return { notifications, unreadCount };
  }

  // Marca una notificación como leída, solo si pertenece al solicitante.
  async markRead(id: string, audience: NotificationAudience, clientId?: string) {
    return prisma.notification.updateMany({
      where: { id, ...this.scopeWhere(audience, clientId) },
      data: { read: true },
    });
  }

  // Marca todas las no leídas del solicitante como leídas.
  async markAllRead(audience: NotificationAudience, clientId?: string) {
    return prisma.notification.updateMany({
      where: { ...this.scopeWhere(audience, clientId), read: false },
      data: { read: true },
    });
  }

  private scopeWhere(audience: NotificationAudience, clientId?: string) {
    if (audience === 'CLIENT') {
      if (!clientId) throw new Error('clientId es obligatorio para notificaciones de cliente');
      return { audience, clientId };
    }
    return { audience };
  }
}

export default new NotificationService();
