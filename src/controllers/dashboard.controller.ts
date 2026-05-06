// src/controllers/dashboard.controller.ts
import { Request, Response } from 'express';
import dashboardService from '../services/dashboard.service';

export class DashboardController {

  // GET /api/v1/dashboard/summary?projectId=
  async getSummary(req: Request, res: Response) {
    try {
      const projectId = req.query.projectId as string | undefined;
      const data = await dashboardService.getSummary(projectId);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // GET /api/v1/dashboard/mora?projectId=
  async getMoraDetail(req: Request, res: Response) {
    try {
      const projectId = req.query.projectId as string | undefined;
      const data = await dashboardService.getMoraDetail(projectId);
      res.status(200).json({ success: true, data, count: data.length });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}

export default new DashboardController();
