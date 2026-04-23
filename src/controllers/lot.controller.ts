// src/controllers/lot.controller.ts
import { Request, Response } from 'express';
import lotService from '../services/lot.service';
import { CreateLotDto, UpdateLotDto, ReserveLotDto, LotFilters } from '../types/lot.types';

export class LotController {
  // POST /api/v1/lots
  async create(req: Request, res: Response) {
    try {
      const data: CreateLotDto = req.body;
      const lot = await lotService.createLot(data);
      
      res.status(201).json({
        success: true,
        message: 'Lote creado exitosamente',
        data: lot,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al crear lote',
      });
    }
  }

  // GET /api/v1/lots
  async getAll(req: Request, res: Response) {
    try {
      const filters: LotFilters = {
        projectId: req.query.projectId as string,
        status: req.query.status as any,
        manzana: req.query.manzana ? Number(req.query.manzana) : undefined,
        minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
        maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
        minArea: req.query.minArea ? Number(req.query.minArea) : undefined,
        maxArea: req.query.maxArea ? Number(req.query.maxArea) : undefined,
      };

      const lots = await lotService.getLots(filters);
      
      res.status(200).json({
        success: true,
        data: lots,
        count: lots.length,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al obtener lotes',
      });
    }
  }

  // GET /api/v1/lots/:id
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const lot = await lotService.getLotById(id);
      
      res.status(200).json({
        success: true,
        data: lot,
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message || 'Lote no encontrado',
      });
    }
  }

  // PUT /api/v1/lots/:id
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: UpdateLotDto = req.body;
      const lot = await lotService.updateLot(id, data);
      
      res.status(200).json({
        success: true,
        message: 'Lote actualizado exitosamente',
        data: lot,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al actualizar lote',
      });
    }
  }

  // POST /api/v1/lots/:id/reserve
  async reserve(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: ReserveLotDto = req.body;
      const lot = await lotService.reserveLot(id, data);
      
      res.status(200).json({
        success: true,
        message: 'Lote apartado exitosamente',
        data: lot,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al apartar lote',
      });
    }
  }

  // DELETE /api/v1/lots/:id/reserve
  async releaseReservation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const lot = await lotService.releaseReservation(id);
      
      res.status(200).json({
        success: true,
        message: 'Apartado liberado exitosamente',
        data: lot,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al liberar apartado',
      });
    }
  }
}

export default new LotController();