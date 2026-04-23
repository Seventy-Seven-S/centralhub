// src/services/payment.service.ts
import { PrismaClient, PaymentStatus, PaymentType } from '@prisma/client';
import { CreatePaymentDto, UpdatePaymentDto, PaymentFilters } from '../types/payment.types';

const prisma = new PrismaClient();

export class PaymentService {
  // Registrar un pago
  async createPayment(data: CreatePaymentDto) {
    // Validar que el contrato existe
    const contract = await prisma.contract.findUnique({
      where: { id: data.contractId },
      include: {
        client: true,
        project: true,
      },
    });

    if (!contract) {
      throw new Error('Contrato no encontrado');
    }

    // Separar monto de pago en mensualidad + extra
    const installmentAmount = data.installmentAmount || data.amount;
    const extraAmount = data.extraAmount || 0;

    // Validar que la suma coincida
    if (installmentAmount + extraAmount !== data.amount) {
      throw new Error('La suma de installmentAmount + extraAmount debe ser igual al monto total');
    }

    // Generar número de pago único
    const paymentNumber = await this.generatePaymentNumber(contract.projectId);

    // Calcular nuevo balance
    const newBalance = (contract.balance || 0) - extraAmount;

    // Crear pago y actualizar balance del contrato en transacción
    const payment = await prisma.$transaction(async (tx) => {
      // 1. Crear el pago
      const newPayment = await tx.payment.create({
        data: {
          paymentNumber,
          contractId: data.contractId,
          clientId: contract.clientId,
          paymentType: PaymentType.INSTALLMENT,
          paymentMethod: data.paymentMethod,
          amount: data.amount,
          installmentAmount,
          extraAmount,
          paymentDate: data.paymentDate,
          concept: `Pago de mensualidad - ${contract.contractNumber}`,
          referenceNumber: data.reference,
          status: PaymentStatus.CONFIRMED,
          balanceAfter: newBalance,
          notes: data.notes,
        },
      });

      // 2. Actualizar balance del contrato
      if (extraAmount > 0 && contract.balance) {
        await tx.contract.update({
          where: { id: data.contractId },
          data: { balance: newBalance },
        });
      }

      return newPayment;
    });

    // Retornar con relaciones
    return await this.getPaymentById(payment.id);
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

  // Generar número de pago único
  private async generatePaymentNumber(projectId: string): Promise<string> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    
    if (!project) {
      throw new Error('Proyecto no encontrado');
    }

    const paymentCount = await prisma.payment.count();
    const nextNumber = (paymentCount + 1).toString().padStart(6, '0');
    return `${project.code}-PAY-${nextNumber}`;
  }
}

export default new PaymentService();