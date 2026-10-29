// src/controllers/payment.controller.ts
import { Request, Response } from 'express';
import paymentService from '../services/payment.service';
import { UpdatePaymentDto, PaymentFilters } from '../types/payment.types';
import { obtenerReciboPorPago } from '../services/reciboLog.service';
import { esSocio } from '../middlewares/alcanceProyectos';

interface PagoListado {
  id: string; paymentNumber: string; paymentType: string; paymentMethod: string;
  amount: number; paymentDate: Date; concept: string; status: string;
  contract?: { codigoLegado: string | null; client: { firstName: string; lastName: string } | null; lots?: unknown } | null;
  corte?: unknown;
}

/**
 * Lo que un SOCIO recibe de cada ingreso: lo que se lee en la tabla y nada
 * más. Lista blanca, no lista negra: el pago trae notas, referencia, quién lo
 * capturó, el saldo del contrato e ids de cliente y contrato, y cualquier
 * campo nuevo quedaría expuesto si solo se borraran los conocidos. Sin el id
 * del contrato la pantalla tampoco puede enlazarlo.
 */
export function pagoParaSocio(p: PagoListado) {
  const c = p.contract;
  return {
    id: p.id,
    paymentNumber: p.paymentNumber,
    paymentType: p.paymentType,
    paymentMethod: p.paymentMethod,
    amount: p.amount,
    paymentDate: p.paymentDate,
    concept: p.concept,
    status: p.status,
    contract: {
      id: null,
      codigoLegado: c?.codigoLegado ?? null,
      client: c?.client ? { firstName: c.client.firstName, lastName: c.client.lastName } : null,
      lots: c?.lots ?? [],
    },
    corte: p.corte ?? null,
  };
}

export class PaymentController {
  // POST /api/v1/payments — registra una mensualidad (servicio unificado)
  async create(req: Request, res: Response) {
    try {
      // userId sale del TOKEN, nunca del body: si viniera del cliente,
      // cualquiera podría atribuirle un cobro a otra persona — y sobre esa
      // atribución se arma el corte diario y la entrega de efectivo.
      const { userId: _ignorado, createdBy: _ignorado2, ...body } = req.body ?? {};
      const result = await paymentService.registrarPagoMensualidad({
        ...body,
        userId: req.user?.userId,
      });
      res.status(201).json({ success: true, message: 'Pago registrado', data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message || 'Error al registrar pago' });
    }
  }

  // GET /api/v1/payments
  async getAll(req: Request, res: Response) {
    try {
      // El listado SIN contrato es el ingreso del negocio (la pantalla de
      // Ingresos): solo ADMIN. Filtrado por contrato es operativo y lo
      // necesita cualquiera que cobre, así que ahí no se restringe.
      // Esconderlo solo en el menú no bastaba: la URL seguía respondiendo.
      // Un SOCIO llega aquí ya acotado a un proyecto suyo (soloProyectoDelSocio);
      // contrato y cliente se le ignoran: no son filtros de su pantalla.
      const socio = esSocio(req);
      const contractId = socio ? undefined : (req.query.contractId as string | undefined)?.trim();
      if (!contractId && !socio && req.user?.role !== 'ADMIN') {
        res.status(403).json({ success: false, message: 'No tienes permiso para ver el listado global de ingresos' });
        return;
      }

      const filters: PaymentFilters = {
        contractId,
        clientId: socio ? undefined : req.query.clientId as string,
        projectId: req.query.projectId as string,
        status: req.query.status as any,
        paymentMethod: req.query.paymentMethod as any,
        minAmount: req.query.minAmount ? Number(req.query.minAmount) : undefined,
        maxAmount: req.query.maxAmount ? Number(req.query.maxAmount) : undefined,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      };

      const pagos = await paymentService.getPayments(filters);
      const payments = socio ? (pagos as PagoListado[]).map(pagoParaSocio) : pagos;

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
  // GET /api/v1/payments/:id/recibo — snapshot del recibo emitido, para
  // reimprimirlo con el mismo folio y QR. 404 si ese pago nunca tuvo recibo.
  async getRecibo(req: Request, res: Response) {
    try {
      const recibo = await obtenerReciboPorPago(req.params.id);
      if (!recibo) {
        res.status(404).json({ success: false, message: 'Este pago no tiene recibo emitido' });
        return;
      }
      res.status(200).json({ success: true, data: recibo });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Error al obtener el recibo' });
    }
  }

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