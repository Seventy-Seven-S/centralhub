// src/controllers/cuota.controller.ts
import { Request, Response } from 'express';
import cuotaService from '../services/cuota.service';
import { CuotaStatus } from '@prisma/client';

export class CuotaController {

  // GET /api/v1/contracts/:id/cuotas
  async getByContract(req: Request, res: Response) {
    try {
      const cuotas = await cuotaService.getCuotasByContract(req.params.id);
      res.status(200).json({ success: true, data: cuotas, count: cuotas.length });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  // GET /api/v1/cuotas?projectId=&status=
  async getAll(req: Request, res: Response) {
    try {
      const projectId = req.query.projectId as string | undefined;
      const statusRaw = req.query.status as string | undefined;
      const status = statusRaw ? (statusRaw.toUpperCase() as CuotaStatus) : undefined;

      const cuotas = await cuotaService.getCuotas({ projectId, status });
      res.status(200).json({ success: true, data: cuotas, count: cuotas.length });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // PATCH /api/v1/cuotas/:id/pay
  async pay(req: Request, res: Response) {
    try {
      const { montoPagado, fechaPago } = req.body;
      if (montoPagado === undefined || montoPagado <= 0) {
        res.status(400).json({ success: false, message: 'montoPagado debe ser mayor a 0' });
        return;
      }

      const cuota = await cuotaService.payCuota(req.params.id, {
        montoPagado: Number(montoPagado),
        fechaPago: fechaPago ? new Date(fechaPago) : undefined,
      });

      res.status(200).json({ success: true, message: 'Cuota registrada', data: cuota });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}

export default new CuotaController();
