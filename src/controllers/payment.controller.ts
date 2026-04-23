// src/controllers/payment.controller.ts
import { Request, Response } from 'express';
import paymentService from '../services/payment.service';
import { CreatePaymentDto, UpdatePaymentDto, PaymentFilters } from '../types/payment.types';

export class PaymentController {
  // POST /api/v1/payments
  async create(req: Request, res: Response) {
    try {
      const data: CreatePaymentDto = req.body;
      const payment = await paymentService.createPayment(data);
      
      res.status(201).json({
        success: true,
        message: 'Pago registrado exitosamente',
        data: payment,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al registrar pago',
      });
    }
  }

  // GET /api/v1/payments
  async getAll(req: Request, res: Response) {
    try {
      const filters: PaymentFilters = {
        contractId: req.query.contractId as string,
        clientId: req.query.clientId as string,
        status: req.query.status as any,
        paymentMethod: req.query.paymentMethod as any,
        minAmount: req.query.minAmount ? Number(req.query.minAmount) : undefined,
        maxAmount: req.query.maxAmount ? Number(req.query.maxAmount) : undefined,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      };

      const payments = await paymentService.getPayments(filters);
      
      res.status(200).json({
        success: true,
        data: payments,
        count: payments.length,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al obtener pagos',
      });
    }
  }

  // GET /api/v1/payments/:id
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const payment = await paymentService.getPaymentById(id);
      
      res.status(200).json({
        success: true,
        data: payment,
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message || 'Pago no encontrado',
      });
    }
  }

  // PUT /api/v1/payments/:id
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: UpdatePaymentDto = req.body;
      const payment = await paymentService.updatePayment(id, data);
      
      res.status(200).json({
        success: true,
        message: 'Pago actualizado exitosamente',
        data: payment,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al actualizar pago',
      });
    }
  }

  // GET /api/v1/contracts/:contractId/payments
  async getByContract(req: Request, res: Response) {
    try {
      const { contractId } = req.params;
      const payments = await paymentService.getPaymentsByContract(contractId);
      
      res.status(200).json({
        success: true,
        data: payments,
        count: payments.length,
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message || 'Error al obtener pagos del contrato',
      });
    }
  } 
}

export default new PaymentController();