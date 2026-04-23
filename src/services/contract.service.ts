// src/services/contract.service.ts
import { PrismaClient, ContractStatus, LotStatus, PaymentPlanType } from '@prisma/client';
import { CreateContractDto, UpdateContractDto, AddCoOwnerDto, ContractFilters } from '../types/contract.types';

const prisma = new PrismaClient();

export class ContractService {
  // Crear un contrato nuevo
  async createContract(data: CreateContractDto) {
    // Validar que el cliente existe
    const client = await prisma.client.findUnique({
      where: { id: data.clientId },
    });

    if (!client) {
      throw new Error('Cliente no encontrado');
    }

    // Validar que el proyecto existe
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
    });

    if (!project) {
      throw new Error('Proyecto no encontrado');
    }

    // Validar que todos los lotes existen y están disponibles
    const lots = await prisma.lot.findMany({
      where: {
        id: { in: data.lotIds },
        projectId: data.projectId,
      },
    });

    if (lots.length !== data.lotIds.length) {
      throw new Error('Algunos lotes no existen o no pertenecen al proyecto');
    }

    const unavailableLots = lots.filter(lot => 
      lot.status !== LotStatus.AVAILABLE && lot.status !== LotStatus.RESERVED
    );

    if (unavailableLots.length > 0) {
      throw new Error(`Los siguientes lotes no están disponibles: ${unavailableLots.map(l => l.lotNumber).join(', ')}`);
    }

    // Generar número de contrato único
    const contractNumber = await this.generateContractNumber(data.projectId);

    // Calcular precio total y balance
    const totalPrice = lots.reduce((sum, lot) => sum + lot.currentPrice, 0);
    const balance = totalPrice - data.downPayment;

    // Crear contrato con transacción
    const contract = await prisma.$transaction(async (tx) => {
      // 1. Crear el contrato
      const newContract = await tx.contract.create({
        data: {
          contractNumber,
          clientId: data.clientId,
          projectId: data.projectId,
          contractDate: data.startDate,
          totalPrice,
          downPayment: data.downPayment,
          financingAmount: data.financedAmount,
          balance,
          paymentPlanType: PaymentPlanType.INSTALLMENTS,
          installmentCount: data.termMonths,
          installmentAmount: data.monthlyPayment,
          interestRate: data.interestRate,
          status: ContractStatus.DRAFT,
          moraMonthsCount: 0,
          startDate: data.startDate,
          notes: data.notes,
        },
      });

      // 2. Vincular lotes al contrato con precio al momento de venta
      for (const lot of lots) {
        await tx.contractLot.create({
          data: {
            contractId: newContract.id,
            lotId: lot.id,
            priceAtSale: lot.currentPrice,
          },
        });
      }

      // 3. Actualizar estado de lotes a SOLD
      await tx.lot.updateMany({
        where: { id: { in: data.lotIds } },
        data: { status: LotStatus.SOLD },
      });

      return newContract;
    });

    // Retornar con relaciones
    return await this.getContractById(contract.id);
  }

  // Listar contratos con filtros
  async getContracts(filters: ContractFilters) {
    const where: any = {};

    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.status) where.status = filters.status;

    if (filters.minBalance || filters.maxBalance) {
      where.balance = {};
      if (filters.minBalance) where.balance.gte = filters.minBalance;
      if (filters.maxBalance) where.balance.lte = filters.maxBalance;
    }

    if (filters.startDateFrom || filters.startDateTo) {
      where.startDate = {};
      if (filters.startDateFrom) where.startDate.gte = filters.startDateFrom;
      if (filters.startDateTo) where.startDate.lte = filters.startDateTo;
    }

    return await prisma.contract.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        project: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        lots: {
          include: {
            lot: {
              select: {
                id: true,
                lotNumber: true,
                manzana: true,
                areaM2: true,
              },
            },
          },
        },
        coOwners: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Obtener un contrato por ID
  async getContractById(id: string) {
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        project: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        lots: {
          include: {
            lot: {
              select: {
                id: true,
                lotNumber: true,
                manzana: true,
                areaM2: true,
                currentPrice: true,
              },
            },
          },
        },
        coOwners: true,
      },
    });

    if (!contract) {
      throw new Error('Contrato no encontrado');
    }

    return contract;
  }

  // Actualizar un contrato
  async updateContract(id: string, data: UpdateContractDto) {
    const contract = await prisma.contract.findUnique({ where: { id } });

    if (!contract) {
      throw new Error('Contrato no encontrado');
    }

    // Mapear campos del DTO a campos del schema
    const updateData: any = {};
    if (data.downPayment !== undefined) updateData.downPayment = data.downPayment;
    if (data.financedAmount !== undefined) updateData.financingAmount = data.financedAmount;
    if (data.interestRate !== undefined) updateData.interestRate = data.interestRate;
    if (data.termMonths !== undefined) updateData.installmentCount = data.termMonths;
    if (data.monthlyPayment !== undefined) updateData.installmentAmount = data.monthlyPayment;
    if (data.balance !== undefined) updateData.balance = data.balance;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.moraMonthsCount !== undefined) updateData.moraMonthsCount = data.moraMonthsCount;
    if (data.notes !== undefined) updateData.notes = data.notes;

    return await prisma.contract.update({
      where: { id },
      data: updateData,
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        project: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });
  }

  // Agregar co-titular a un contrato
  async addCoOwner(contractId: string, data: AddCoOwnerDto) {
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });

    if (!contract) {
      throw new Error('Contrato no encontrado');
    }

    return await prisma.coOwner.create({
      data: {
        contractId,
        firstName: data.firstName,
        lastName: data.lastName,
        ine: data.ine,
        estadoCivil: data.estadoCivil || 'Soltero/a',
        lugarNacimiento: data.lugarNacimiento || 'No especificado',
        isPrimary: data.isPrimary,
      },
    });
  }

  // Generar número de contrato único
  private async generateContractNumber(projectId: string): Promise<string> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    
    if (!project) {
      throw new Error('Proyecto no encontrado');
    }

    const contractCount = await prisma.contract.count({
      where: { projectId },
    });

    const nextNumber = (contractCount + 1).toString().padStart(4, '0');
    return `${project.code}-CON-${nextNumber}`;
  }
}

export default new ContractService();