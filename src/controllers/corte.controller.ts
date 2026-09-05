// src/controllers/corte.controller.ts
import { Request, Response } from 'express';
import corteService from '../services/corte.service';

function statusFor(msg: string) {
  if (/no encontrado/i.test(msg)) return 404;
  if (/al menos un pago|exceden|negativ|ya están en otro corte|indica el nombre|proyecto/i.test(msg)) return 400;
  return 500;
}

export class CorteController {
  // GET /api/v1/cortes/pendientes?projectId=
  async pendientes(req: Request, res: Response) {
    try {
      const projectId = String(req.query.projectId || '');
      if (!projectId) { res.status(400).json({ success: false, message: 'projectId es requerido' }); return; }
      res.json({ success: true, data: await corteService.pendientes(projectId) });
    } catch (error: any) {
      res.status(statusFor(error.message)).json({ success: false, message: error.message });
    }
  }

  // GET /api/v1/cortes?projectId=
  async listar(req: Request, res: Response) {
    try {
      const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
      res.json({ success: true, data: await corteService.listar(projectId) });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // GET /api/v1/cortes/:id
  async obtener(req: Request, res: Response) {
    try {
      res.json({ success: true, data: await corteService.obtener(req.params.id) });
    } catch (error: any) {
      res.status(statusFor(error.message)).json({ success: false, message: error.message });
    }
  }

  // POST /api/v1/cortes
  async crear(req: Request, res: Response) {
    try {
      const { projectId, fecha, paymentIds, reparto, dueno, duenoCategoryId, notas } = req.body ?? {};
      const corte = await corteService.crearCorte({
        projectId, fecha, paymentIds: Array.isArray(paymentIds) ? paymentIds : [],
        reparto: Array.isArray(reparto) ? reparto.map((r: any) => ({ categoryId: String(r.categoryId), amount: Number(r.amount) })) : [],
        dueno, duenoCategoryId, notas, userId: req.user!.userId,
      });
      res.status(201).json({ success: true, data: corte, message: `Corte #${corte.numero} registrado` });
    } catch (error: any) {
      res.status(statusFor(error.message)).json({ success: false, message: error.message });
    }
  }
}

export default new CorteController();
