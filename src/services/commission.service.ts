// src/services/commission.service.ts
import { PrismaClient, CommissionType, CommissionStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Tasa de comisión por defecto cuando el proyecto no define commissionValue.
export const DEFAULT_COMMISSION_RATE = 4;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ────────────────────────────────────────────────────────────────────────────
// buildCommissionData (función PURA — sin Prisma, sin side effects, testeable)
//
// Reglas:
//  - Si el contrato no tiene agentId → null (sin agente no hay comisión).
//  - rate = project.commissionValue ?? DEFAULT_COMMISSION_RATE (4 %).
//  - baseAmount = contract.totalPrice.
//  - commissionAmount = round2(baseAmount * rate / 100).
//
// NOTA DE DISEÑO: la auto-comisión SIEMPRE se calcula como porcentaje sobre el
// totalPrice. La config `commissionType` del proyecto (PERCENTAGE | FIXED) NO se
// honra todavía: `commissionValue` se interpreta siempre como porcentaje. Si en
// el futuro se quiere soportar FIXED, este helper es el único punto a cambiar.
// ────────────────────────────────────────────────────────────────────────────

export interface BuildCommissionContractInput {
  id: string;
  agentId: string | null;
  totalPrice: number;
}

export interface BuildCommissionProjectInput {
  commissionValue: number | null;
}

export interface CommissionCreateData {
  contractId: string;
  agentId: string;
  commissionType: CommissionType;
  percentage: number;
  baseAmount: number;
  commissionAmount: number;
  status: CommissionStatus;
}

export function buildCommissionData(
  contract: BuildCommissionContractInput,
  project: BuildCommissionProjectInput,
): CommissionCreateData | null {
  // Sin agente asignado no hay a quién pagarle: no se crea comisión.
  if (!contract.agentId) {
    return null;
  }

  const rate = project.commissionValue ?? DEFAULT_COMMISSION_RATE;
  const baseAmount = contract.totalPrice;
  const commissionAmount = round2((baseAmount * rate) / 100);

  return {
    contractId: contract.id,
    agentId: contract.agentId,
    commissionType: CommissionType.SALE,
    percentage: rate,
    baseAmount,
    commissionAmount,
    status: CommissionStatus.PENDING,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Módulo de seguimiento (consulta + marcar pagada)
// ────────────────────────────────────────────────────────────────────────────

export interface CommissionFilters {
  status?: CommissionStatus;
  agentId?: string;
}

export class CommissionService {
  // Listar comisiones con contrato (contractNumber) y agente (firstName/lastName).
  async getCommissions(filters: CommissionFilters = {}) {
    const where: { status?: CommissionStatus; agentId?: string } = {};
    if (filters.status) where.status = filters.status;
    if (filters.agentId) where.agentId = filters.agentId;

    return prisma.commission.findMany({
      where,
      include: {
        contract: {
          select: { id: true, contractNumber: true },
        },
        agent: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Marcar comisión como pagada: PENDING (o APPROVED) → PAID + paymentDate = now.
  // Si ya está PAID, lanza error (el controller responde 400).
  async payCommission(id: string) {
    const commission = await prisma.commission.findUnique({ where: { id } });

    if (!commission) {
      throw new Error('Comisión no encontrada');
    }

    if (commission.status === CommissionStatus.PAID) {
      throw new Error('La comisión ya está pagada');
    }

    return prisma.commission.update({
      where: { id },
      data: {
        status: CommissionStatus.PAID,
        paymentDate: new Date(),
      },
      include: {
        contract: {
          select: { id: true, contractNumber: true },
        },
        agent: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }
}

export default new CommissionService();
