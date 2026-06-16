// src/services/contract.service.ts
import { PrismaClient, ContractStatus, LotStatus, PaymentPlanType, CuotaStatus, PaymentType, PaymentMethod, PaymentStatus } from '@prisma/client';
import { CreateContractDto, UpdateContractDto, AddCoOwnerDto, ContractFilters } from '../types/contract.types';
import { sendWelcomeEmail } from './email.service';
import { TotalUpfrontExceedsPriceError } from '../utils/errors';
import { migrateIneToClient } from './ineDocument';
import { buildCommissionData } from './commission.service';
import { logger } from '../utils/logger';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ────────────────────────────────────────────────────────────────────────────
// computeDepositSplit (pure function — sin Prisma, sin side effects)
// Semántica: depósito de apartado y enganche al firmar son pagos
// INDEPENDIENTES. El total upfront = depósito + enganche; debe ser ≤ precio.
// ────────────────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DepositSplitLot {
  id: string;
  reservationDeposit: number | null;
  manzana: number;
  lotNumber: string;
  reservedAt: Date | null;
}

export interface DepositSplitResult {
  totalDeposit: number;        // suma de depósitos de apartado de los lotes
  enganche: number;            // enganche al firmar (pass-through con round2)
  totalUpfront: number;        // = totalDeposit + enganche (se guarda en Contract.downPayment)
  depositSources: Array<{ lotLabel: string; amount: number; reservedAt: Date }>;
}

export function computeDepositSplit(
  lots: DepositSplitLot[],
  engancheAlFirmar: number,
  totalPrice: number,
): DepositSplitResult {
  const depositSources: DepositSplitResult['depositSources'] = [];
  let rawTotal = 0;

  for (const lot of lots) {
    const deposit = lot.reservationDeposit ?? 0;
    if (deposit > 0) {
      rawTotal += deposit;
      depositSources.push({
        lotLabel: `M${lot.manzana} L-${lot.lotNumber}`,
        amount: round2(deposit),
        reservedAt: lot.reservedAt as Date,
      });
    }
  }

  const totalDeposit = round2(rawTotal);
  const enganche = round2(engancheAlFirmar);
  const totalUpfront = round2(totalDeposit + enganche);
  const totalPriceRounded = round2(totalPrice);

  if (totalUpfront > totalPriceRounded) {
    throw new TotalUpfrontExceedsPriceError(totalUpfront, totalPriceRounded);
  }

  return { totalDeposit, enganche, totalUpfront, depositSources };
}

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

    // Calcular precio total primero (necesario para validar el split)
    const totalPrice = (data as any).totalPrice && (data as any).totalPrice > 0
      ? (data as any).totalPrice
      : lots.reduce((sum, lot) => sum + lot.currentPrice, 0);

    // Calcular split: depósito de apartado + enganche al firmar = total upfront.
    // Si totalUpfront > totalPrice, lanza TotalUpfrontExceedsPriceError aquí mismo
    // (antes de abrir la transacción, así no tocamos BD).
    const depositSplit = computeDepositSplit(lots, data.downPayment, totalPrice);

    // Generar número de contrato único
    const generatedNumber = await this.generateContractNumber(data.projectId);

    // Bajo la semántica 'pago separado':
    // - Contract.downPayment = total upfront (depósito + enganche)
    // - Contract.balance = lo que queda por financiar
    const balance = Math.round((totalPrice - depositSplit.totalUpfront) * 100) / 100;

    // Crear contrato con transacción
    const contract = await prisma.$transaction(async (tx) => {
      // 1. Crear el contrato
      const newContract = await tx.contract.create({
        data: {
          contractNumber: generatedNumber,
          codigoLegado:   generatedNumber,
          clientId: data.clientId,
          projectId: data.projectId,
          contractDate: data.startDate,
          totalPrice,
          // downPayment ahora representa el TOTAL UPFRONT (depósito + enganche al firmar)
          downPayment: depositSplit.totalUpfront,
          // financingAmount = balance = lo que va a mensualidades
          financingAmount: balance,
          balance,
          paymentPlanType: PaymentPlanType.INSTALLMENTS,
          installmentCount: data.termMonths,
          installmentAmount: data.monthlyPayment,
          interestRate: data.interestRate,
          status: ContractStatus.DRAFT,
          moraMonthsCount: 0,
          startDate: data.startDate,
          notes: data.notes,
          // Vendedor asignado (rol AGENT o MANAGER), opcional.
          agentId: data.agentId ?? null,
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

      // 3. Actualizar estado de lotes a SOLD + limpiar campos de reserva
      // (los datos del apartado quedan registrados en Payment, no en Lot)
      await tx.lot.updateMany({
        where: { id: { in: data.lotIds } },
        data: {
          status:             LotStatus.SOLD,
          reservedAt:         null,
          reservationExpiry:  null,
          reservationDeposit: null,
          reservedByName:     null,
          reservedByPhone:    null,
          reservedByEmail:    null,
          reservedByAgentId:  null,
        },
      });

      // 4. Migrar la INE del apartado al expediente del cliente
      // (la INE 'pertenece al Client' como estado final — ver spec INE)
      await migrateIneToClient(tx, data.lotIds, data.clientId);

      return newContract;
    });

    // Generar cuotas automáticamente
    const cuotas = [];
    for (let i = 1; i <= contract.installmentCount; i++) {
      const fechaVencimiento = new Date(contract.startDate);
      fechaVencimiento.setMonth(fechaVencimiento.getMonth() + i);
      cuotas.push({
        contractId: contract.id,
        numeroCuota: i,
        mes: fechaVencimiento.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }),
        fechaVencimiento,
        montoEsperado: contract.installmentAmount,
        status: CuotaStatus.PENDIENTE,
      });
    }

    await prisma.cuota.createMany({ data: cuotas });

    // Registrar pagos bajo la semántica 'pago separado':
    //   - Si hubo depósito de apartado → Payment tipo RESERVATION_DEPOSIT (fecha = min(reservedAt))
    //   - Si hay enganche al firmar > 0 → Payment tipo DOWN_PAYMENT (fecha = startDate)
    // Ambos pagos son INDEPENDIENTES (no se restan entre sí).
    let paymentSeq = 0;

    if (depositSplit.totalDeposit > 0) {
      paymentSeq += 1;
      const paymentNumber = `PAY-${contract.codigoLegado}-${String(paymentSeq).padStart(3, '0')}`;
      const earliestReservedAt = depositSplit.depositSources.reduce(
        (min, src) => (src.reservedAt < min ? src.reservedAt : min),
        depositSplit.depositSources[0].reservedAt,
      );
      const conceptParts = depositSplit.depositSources
        .map(s => `${s.lotLabel} ($${s.amount.toLocaleString('es-MX')})`)
        .join('; ');

      await prisma.payment.create({
        data: {
          contractId:    contract.id,
          clientId:      contract.clientId,
          amount:        depositSplit.totalDeposit,
          paymentDate:   earliestReservedAt,
          concept:       `Depósito de apartado: ${conceptParts}`,
          paymentType:   PaymentType.RESERVATION_DEPOSIT,
          paymentMethod: PaymentMethod.TRANSFER,
          status:        PaymentStatus.CONFIRMED,
          paymentNumber,
        },
      });
    }

    if (depositSplit.enganche > 0) {
      paymentSeq += 1;
      const paymentNumber = `PAY-${contract.codigoLegado}-${String(paymentSeq).padStart(3, '0')}`;

      await prisma.payment.create({
        data: {
          contractId:    contract.id,
          clientId:      contract.clientId,
          amount:        depositSplit.enganche,
          paymentDate:   contract.startDate ?? contract.contractDate,
          concept:       'Enganche al firmar',
          paymentType:   PaymentType.DOWN_PAYMENT,
          paymentMethod: PaymentMethod.TRANSFER,
          status:        PaymentStatus.CONFIRMED,
          paymentNumber,
        },
      });
    }

    // Creación de comisión MANUAL (SECUNDARIA — nunca debe romper el contrato).
    // Se hace DESPUÉS de la transacción principal, igual que cuotas/payments.
    // Solo se crea si el contrato trae vendedor (agentId) Y un % de comisión
    // tecleado (> 0). El monto se calcula sobre el precio del contrato.
    // Todo va envuelto en try/catch que solo loggea: una comisión fallida NO
    // debe abortar la creación del contrato.
    try {
      const commissionData = buildCommissionData({
        contractId: contract.id,
        agentId: data.agentId,
        percentage: data.commissionPercentage,
        baseAmount: totalPrice,
      });
      if (commissionData) {
        await prisma.commission.create({ data: commissionData });
      }
    } catch (err) {
      logger.error(
        `Error creando comisión automática para contrato ${contract.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // Retornar con relaciones
    const fullContract = await this.getContractById(contract.id);

    if (fullContract.client?.email) {
      const lote = fullContract.lots?.[0]?.lot;
      const lotLabel = lote ? `M${lote.manzana} L-${lote.lotNumber}` : '—';

      let tempPassword: string | undefined;

      const existingClientUser = await prisma.clientUser.findUnique({
        where: { email: fullContract.client.email },
      });

      if (!existingClientUser) {
        const lastName = fullContract.client.lastName ?? '';
        const phone = fullContract.client.phone ?? '';
        const rawPassword = (lastName.slice(0, 4) + phone.slice(-4)).toLowerCase() || 'Central2024';
        tempPassword = rawPassword;
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        await prisma.clientUser.create({
          data: {
            clientId: fullContract.client.id,
            email: fullContract.client.email,
            password: hashedPassword,
            status: 'ACTIVE',
          },
        });
      }

      sendWelcomeEmail(
        fullContract.client.email,
        fullContract.client.firstName,
        fullContract.codigoLegado ?? fullContract.contractNumber,
        fullContract.project.name,
        lotLabel,
        fullContract.installmentAmount,
        undefined,
        tempPassword,
      ).catch(err => console.error('Error enviando email de bienvenida:', err));
    }

    return fullContract;
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
            ine: true,
            curp: true,
            estadoCivil: true,
            lugarNacimiento: true,
            address: true,
            city: true,
            state: true,
            zipCode: true,
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

  // Activar un contrato manualmente (sin requerir el PDF firmado)
  async activateContract(id: string) {
    const contract = await prisma.contract.findUnique({ where: { id } });

    if (!contract) {
      throw new Error('Contrato no encontrado');
    }

    if (contract.status === ContractStatus.ACTIVE) {
      throw new Error('El contrato ya está activo');
    }

    // No tocamos contractFileUrl: el contrato puede activarse sin PDF firmado.
    return await prisma.contract.update({
      where: { id },
      data: { status: ContractStatus.ACTIVE },
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
    const lastContract = await prisma.contract.findFirst({
      where: {
        projectId,
        codigoLegado: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (lastContract?.codigoLegado) {
      const match = lastContract.codigoLegado.match(/^K(\d+)$/);
      if (match) {
        const nextNum = parseInt(match[1]) + 1;
        return `K${String(nextNum).padStart(3, '0')}`;
      }
    }

    return 'K001';
  }
}

export default new ContractService();