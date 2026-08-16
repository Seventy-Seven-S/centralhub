// src/services/payment.service.ts
import { PrismaClient, PaymentStatus, PaymentType, CuotaStatus, ContractStatus } from '@prisma/client';
import { RegistrarPagoDto, UpdatePaymentDto, PaymentFilters } from '../types/payment.types';
import { aplicarPagoACuotas } from './lib/pagoCuotas';
import { nextPaymentNumber } from './lib/paymentNumber';
import notificationService from './notification.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class PaymentService {
  /**
   * Registra un pago de MENSUALIDAD de forma unificada:
   * Payment + cascada sobre cuotas + balance + mora, en UNA transacción.
   * Lo usan POST /payments y PATCH /cuotas/:id/pay.
   */
  async registrarPagoMensualidad(data: RegistrarPagoDto): Promise<{ payment: any; cuotasAfectadas: number[] }> {
    if (!data.amount || data.amount <= 0) throw new Error('El monto debe ser mayor a 0');

    const contract = await prisma.contract.findUnique({
      where: { id: data.contractId },
      include: { client: true, project: true },
    });
    if (!contract) throw new Error('Contrato no encontrado');
    if (contract.status === ContractStatus.CANCELED) throw new Error('El contrato está cancelado');

    const cuotas = await prisma.cuota.findMany({
      where: { contractId: data.contractId },
      orderBy: { numeroCuota: 'asc' },
    });
    const hayPendientes = cuotas.some(c => c.status !== CuotaStatus.PAGADA);
    if (!hayPendientes) throw new Error('El contrato no tiene cuotas pendientes');

    const fechaPago = data.paymentDate instanceof Date ? data.paymentDate : new Date(data.paymentDate);

    const updates = aplicarPagoACuotas(
      data.amount,
      fechaPago,
      cuotas.map(c => ({
        id: c.id,
        montoEsperado: c.montoEsperado,
        montoPagado: c.montoPagado ?? 0,
        status: c.status === CuotaStatus.PAGADA ? 'PAGADA' as const : 'PENDIENTE' as const,
      })),
    );
    const cuotasAfectadas = cuotas
      .filter(c => updates.some(u => u.id === c.id))
      .map(c => c.numeroCuota);

    const primera = cuotas.find(c => c.numeroCuota === cuotasAfectadas[0]);
    const concept = data.concept?.trim()
      || (cuotasAfectadas.length > 1
        ? `Mensualidades #${cuotasAfectadas[0]}–#${cuotasAfectadas[cuotasAfectadas.length - 1]}`
        : `Mensualidad #${cuotasAfectadas[0] ?? ''}${primera ? ` — ${primera.mes}` : ''}`);

    // Folio generado fuera de la tx: si la transacción hace rollback puede quedar un hueco de folio.
    const paymentNumber = await this.generatePaymentNumber(contract.projectId);

    const created = await prisma.$transaction(async (tx) => {
      // Releer balance dentro de la tx para evitar valor stale bajo concurrencia.
      const fresh = await tx.contract.findUnique({ where: { id: data.contractId }, select: { balance: true } });
      const newBalance = (fresh?.balance ?? 0) - data.amount;

      const p = await tx.payment.create({
        data: {
          paymentNumber,
          contractId: data.contractId,
          clientId: contract.clientId,
          paymentType: PaymentType.INSTALLMENT,
          paymentMethod: data.paymentMethod,
          amount: data.amount,
          paymentDate: fechaPago,
          concept,
          referenceNumber: data.reference,
          notes: data.notes,
          status: PaymentStatus.CONFIRMED,
          balanceAfter: newBalance,
        },
      });
      for (const u of updates) {
        await tx.cuota.update({
          where: { id: u.id },
          data: { montoPagado: u.montoPagado, fechaPago: u.fechaPago, status: u.status as CuotaStatus },
        });
      }
      await tx.contract.update({
        where: { id: data.contractId },
        data: { balance: { decrement: data.amount } },
      });
      const hoy = new Date();
      const vencidas = await tx.cuota.count({
        where: { contractId: data.contractId, status: CuotaStatus.PENDIENTE, fechaVencimiento: { lt: hoy } },
      });
      await tx.contract.update({
        where: { id: data.contractId },
        data: { moraMonthsCount: vencidas, status: vencidas > 0 ? ContractStatus.IN_MORA : ContractStatus.ACTIVE },
      });
      return p;
    });

    // Notificaciones in-app (fire-and-forget): ADMIN (copia de todo) + el
    // cliente en su portal.
    try {
      const cliente = `${contract.client?.firstName ?? ''} ${contract.client?.lastName ?? ''}`.trim() || 'cliente';
      const montoFmt = data.amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      await notificationService.createNotification({
        type: 'PAYMENT',
        message: `Pago registrado: ${montoFmt} — ${cliente}`,
        relatedEntity: 'payment',
        relatedEntityId: created.id,
      });
      await notificationService.createNotification({
        type: 'PAYMENT',
        message: `Tu pago de ${montoFmt} fue registrado. ¡Gracias!`,
        relatedEntity: 'payment',
        relatedEntityId: created.id,
        audience: 'CLIENT',
        clientId: contract.clientId,
      });
    } catch (err) {
      logger.error(`Error creando notificación de pago ${created.id}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const payment = await this.getPaymentById(created.id);
    return { payment, cuotasAfectadas };
  }

  // Listar pagos con filtros
  async getPayments(filters: PaymentFilters) {
    const where: any = {};

    if (filters.contractId) where.contractId = filters.contractId;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.status) where.status = filters.status;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;

    if (filters.minAmount || filters.maxAmount) {
      where.amount = {};
      if (filters.minAmount) where.amount.gte = filters.minAmount;
      if (filters.maxAmount) where.amount.lte = filters.maxAmount;
    }

    if (filters.startDate || filters.endDate) {
      where.paymentDate = {};
      if (filters.startDate) where.paymentDate.gte = filters.startDate;
      if (filters.endDate) where.paymentDate.lte = filters.endDate;
    }

    return await prisma.payment.findMany({
      where,
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            balance: true,
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  // Obtener un pago por ID
  async getPaymentById(id: string) {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            balance: true,
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new Error('Pago no encontrado');
    }

    return payment;
  }

  // Actualizar un pago
  async updatePayment(id: string, data: UpdatePaymentDto) {
    const payment = await prisma.payment.findUnique({ where: { id } });

    if (!payment) {
      throw new Error('Pago no encontrado');
    }

    // Mapear campos del DTO a campos del schema
    const updateData: any = {};
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.paymentDate !== undefined) updateData.paymentDate = data.paymentDate;
    if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.installmentAmount !== undefined) updateData.installmentAmount = data.installmentAmount;
    if (data.extraAmount !== undefined) updateData.extraAmount = data.extraAmount;
    if (data.reference !== undefined) updateData.referenceNumber = data.reference;
    if (data.notes !== undefined) updateData.notes = data.notes;

    return await prisma.payment.update({
      where: { id },
      data: updateData,
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            balance: true,
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });
  }

  // Obtener pagos de un contrato
  async getPaymentsByContract(contractId: string) {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
    });

    if (!contract) {
      throw new Error('Contrato no encontrado');
    }

    return await prisma.payment.findMany({
      where: { contractId },
      orderBy: { paymentDate: 'desc' },
    });
  }

  // Generar número de pago único: continúa la serie del PROYECTO desde su
  // máximo real (no count()+1 global, que colisionaba tras borrados o
  // registros concurrentes — paymentNumber es unique global). Verifica
  // existencia por si la serie trae huecos o números legados fuera de patrón.
  private async generatePaymentNumber(projectId: string): Promise<string> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });

    if (!project) {
      throw new Error('Proyecto no encontrado');
    }

    const prefix = `${project.code}-PAY-`;
    const last = await prisma.payment.findFirst({
      where: { paymentNumber: { startsWith: prefix } },
      orderBy: { paymentNumber: 'desc' },
      select: { paymentNumber: true },
    });

    let candidate = nextPaymentNumber(last?.paymentNumber ?? null, prefix);
    while (await prisma.payment.findFirst({ where: { paymentNumber: candidate }, select: { id: true } })) {
      candidate = nextPaymentNumber(candidate, prefix);
    }

    return candidate;
  }
}

export default new PaymentService();