// src/controllers/notification.controller.ts
import { Request, Response } from 'express';
import { NotificationAudience } from '@prisma/client';
import notificationService from '../services/notification.service';

// El buzón de staff sirve la audiencia según el rol del token:
// ADMIN → stream ADMIN ("copia de todo"), MANAGER → stream MANAGER.
function audienceFor(req: Request): NotificationAudience {
  return req.user?.role === 'MANAGER' ? 'MANAGER' : 'ADMIN';
}

export class NotificationController {
  // GET /api/v1/notifications → { notifications, unreadCount }
  async getAll(req: Request, res: Response) {
    try {
      const { notifications, unreadCount } = await notificationService.getNotifications(audienceFor(req));
      res.status(200).json({ success: true, notifications, unreadCount });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error al obtener notificaciones',
      });
    }
  }

  // PATCH /api/v1/notifications/:id/read → marca leída (solo de su audiencia)
  async markRead(req: Request, res: Response) {
    try {
      const result = await notificationService.markRead(req.params.id, audienceFor(req));
      res.status(200).json({ success: true, count: result.count });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al marcar notificación como leída',
      });
    }
  }

  // POST /api/v1/notifications/read-all → marca todas las de su audiencia
  async markAllRead(req: Request, res: Response) {
    try {
      const result = await notificationService.markAllRead(audienceFor(req));
      res.status(200).json({ success: true, count: result.count });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error al marcar notificaciones como leídas',
      });
    }
  }
}

export default new NotificationController();
