// src/controllers/lot.controller.ts
import { Request, Response } from 'express';
import lotService from '../services/lot.service';
import { CreateLotDto, UpdateLotDto, ReserveLotDto, LotFilters } from '../types/lot.types';
import { IneUploadError } from '../utils/errors';
import { IneFileInput } from '../services/ineDocument';

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

      // Metadata INE: hasIne para todos; ineDocument solo ADMIN/MANAGER
      // (los agentes suben pero no consultan — spec INE).
      const reservedIds = lots.filter((l) => l.status === 'RESERVED').map((l) => l.id);
      const ineMap = await lotService.getIneDocumentsByLotIds(reservedIds);
      const role = req.user?.role;
      const isAdminOrManager = role === 'ADMIN' || role === 'MANAGER';

      const data = lots.map((lot) => {
        const doc = ineMap.get(lot.id);
        return {
          ...lot,
          hasIne: !!doc,
          ineDocument: isAdminOrManager && doc ? doc : null,
        };
      });

      res.status(200).json({
        success: true,
        data,
        count: data.length,
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

      const ineMap = await lotService.getIneDocumentsByLotIds([id]);
      const doc = ineMap.get(id);
      const role = req.user?.role;
      const isAdminOrManager = role === 'ADMIN' || role === 'MANAGER';

      res.status(200).json({
        success: true,
        data: {
          ...lot,
          hasIne: !!doc,
          ineDocument: isAdminOrManager && doc ? doc : null,
        },
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

  // POST /api/v1/lots/:id/reserve  (multipart/form-data, campo de archivo: ineFile)
  async reserve(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const file = (req as any).file as Express.Multer.File | undefined;

      // "Yo aparto, yo cobro": si quien aparta es AGENT, el apartado es
      // suyo, forzado desde su token — ignora cualquier agentId del body
      // (no puede atribuirse a otro ni dejarlo sin asesor). El dropdown de
      // asesor solo tiene sentido para ADMIN/MANAGER, que apartan en
      // nombre de un asesor ausente — para ellos se respeta el body tal
      // cual (comportamiento actual, sin cambios).
      const agentId = req.user?.role === 'AGENT'
        ? req.user.userId
        : (req.body.agentId || undefined);

      // multipart entrega todos los campos como string
      const data: ReserveLotDto = {
        deposit:     Number(req.body.deposit) || 0,
        clientName:  req.body.clientName,
        clientPhone: req.body.clientPhone,
        clientEmail: req.body.clientEmail || undefined,
        agentId,
      };

      const ineFile: IneFileInput | undefined = file
        ? {
            buffer:       file.buffer,
            originalName: file.originalname,
            mimeType:     file.mimetype,
            size:         file.size,
          }
        : undefined;

      const uploadedBy = req.user?.userId;
      const lot = await lotService.reserveLot(id, data, ineFile, uploadedBy);

      res.status(200).json({
        success: true,
        message: 'Lote apartado exitosamente',
        data: lot,
      });
    } catch (error: any) {
      if (error instanceof IneUploadError) {
        return res.status(400).json({
          success: false,
          code: error.code,
          message: error.message,
        });
      }
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