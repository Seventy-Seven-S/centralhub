// src/controllers/contract.controller.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import contractService from '../services/contract.service';
import { logger } from '../utils/logger';
import { DepositExceedsDownPaymentError } from '../utils/errors';
import { CreateContractDto, UpdateContractDto, AddCoOwnerDto, ContractFilters } from '../types/contract.types';

const prisma = new PrismaClient();

export class ContractController {
  // POST /api/v1/contracts
  async create(req: Request, res: Response) {
    try {
      const data: CreateContractDto = req.body;
      const contract = await contractService.createContract(data);

      res.status(201).json({
        success: true,
        message: 'Contrato creado exitosamente',
        data: contract,
      });
    } catch (error: any) {
      if (error instanceof DepositExceedsDownPaymentError) {
        logger.warn('Contract creation rejected: deposit exceeds down payment', {
          clientId:      req.body?.clientId,
          projectId:     req.body?.projectId,
          lotIds:        req.body?.lotIds,
          totalDeposit:  error.totalDeposit,
          downPayment:   error.downPayment,
          agentId:       (req as any).user?.id,
        });
        return res.status(400).json({
          success:      false,
          code:         error.code,
          message:      `El depósito del apartado ($${error.totalDeposit.toLocaleString('es-MX')}) excede el enganche pactado ($${error.downPayment.toLocaleString('es-MX')}). Ajusta el enganche o renegocia el depósito antes de continuar.`,
          totalDeposit: error.totalDeposit,
          downPayment:  error.downPayment,
        });
      }
      res.status(400).json({
        success: false,
        message: error.message || 'Error al crear contrato',
      });
    }
  }

  // GET /api/v1/contracts
  async getAll(req: Request, res: Response) {
    try {
      const filters: ContractFilters = {
        clientId: req.query.clientId as string,
        projectId: req.query.projectId as string,
        status: req.query.status as any,
        minBalance: req.query.minBalance ? Number(req.query.minBalance) : undefined,
        maxBalance: req.query.maxBalance ? Number(req.query.maxBalance) : undefined,
        startDateFrom: req.query.startDateFrom ? new Date(req.query.startDateFrom as string) : undefined,
        startDateTo: req.query.startDateTo ? new Date(req.query.startDateTo as string) : undefined,
      };

      const contracts = await contractService.getContracts(filters);
      
      res.status(200).json({
        success: true,
        data: contracts,
        count: contracts.length,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al obtener contratos',
      });
    }
  }

  // GET /api/v1/contracts/:id
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const contract = await contractService.getContractById(id);
      
      res.status(200).json({
        success: true,
        data: contract,
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message || 'Contrato no encontrado',
      });
    }
  }

  // PUT /api/v1/contracts/:id
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: UpdateContractDto = req.body;
      const contract = await contractService.updateContract(id, data);
      
      res.status(200).json({
        success: true,
        message: 'Contrato actualizado exitosamente',
        data: contract,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al actualizar contrato',
      });
    }
  }

  // POST /api/v1/contracts/:id/coowners
  async addCoOwner(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: AddCoOwnerDto = req.body;
      const coOwner = await contractService.addCoOwner(id, data);
      
      res.status(201).json({
        success: true,
        message: 'Co-titular agregado exitosamente',
        data: coOwner,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al agregar co-titular',
      });
    }
  }

  // POST /api/v1/contracts/:id/upload-signed
  async uploadSigned(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const file = (req as any).file;

      if (!file) {
        res.status(400).json({ success: false, message: 'No se recibió ningún archivo' });
        return;
      }

      const contractFileUrl = `/uploads/contratos/${file.filename}`;

      await prisma.contract.update({
        where: { id },
        data: { contractFileUrl, status: 'ACTIVE' },
      });

      res.json({ success: true, data: { contractFileUrl, status: 'ACTIVE' } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Error al subir el contrato' });
    }
  }
}

export default new ContractController();