// src/controllers/commission.controller.ts
import { Request, Response } from 'express';
import { CommissionStatus } from '@prisma/client';
import commissionService, { CommissionFilters } from '../services/commission.service';

export class CommissionController {
  // GET /api/v1/commissions
  async getAll(req: Request, res: Response) {
    try {
      const filters: CommissionFilters = {};

      const status = req.query.status as string | undefined;
      if (status && status in CommissionStatus) {
        filters.status = status as CommissionStatus;
      }

      const agentId = req.query.agentId as string | undefined;
      if (agentId) {
        filters.agentId = agentId;
      }

      const commissions = await commissionService.getCommissions(filters);
      res.status(200).json({
        success: true,
        data: commissions,
        count: commissions.length,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error al obtener comisiones',
      });
    }
  }

  // PATCH /api/v1/commissions/:id/pay
  async pay(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const commission = await commissionService.payCommission(id);
      res.status(200).json({
        success: true,
        message: 'Comisión marcada como pagada',
        data: commission,
      });
    } catch (error: any) {
      const message = error.message || 'Error al marcar comisión como pagada';
      const status = message === 'Comisión no encontrada' ? 404 : 400;
      res.status(status).json({
        success: false,
        message,
      });
    }
  }
}

export default new CommissionController();
