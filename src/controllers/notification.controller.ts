// src/controllers/notification.controller.ts
import { Request, Response } from 'express';
import notificationService from '../services/notification.service';

export class NotificationController {
  // GET /api/v1/notifications → { notifications, unreadCount }
  async getAll(_req: Request, res: Response) {
    try {
      const { notifications, unreadCount } = await notificationService.getNotifications();
      res.status(200).json({ success: true, notifications, unreadCount });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error al obtener notificaciones',
      });
    }
  }

  // PATCH /api/v1/notifications/:id/read → marca leída
  async markRead(req: Request, res: Response) {
    try {
      const notification = await notificationService.markRead(req.params.id);
      res.status(200).json({ success: true, data: notification });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al marcar notificación como leída',
      });
    }
  }

  // POST /api/v1/notifications/read-all → marca todas leídas
  async markAllRead(_req: Request, res: Response) {
    try {
      const result = await notificationService.markAllRead();
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
