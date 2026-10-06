// src/services/commission.service.ts
import { PrismaClient, CommissionType, CommissionStatus } from '@prisma/client';

const prisma = new PrismaClient();

const round2 = (n: number) => Math.round(n * 100) / 100;

// ────────────────────────────────────────────────────────────────────────────
// buildCommissionData (función PURA — sin Prisma, sin side effects, testeable)
//
// NUEVA SEMÁNTICA: "asignación de vendedor + comisión manual".
// La comisión YA NO es 4 % automático del proyecto. Al crear el contrato se
// elige un vendedor (agentId) y se teclea MANUALMENTE el % de comisión
// (variable por venta). El monto se calcula sobre el precio del contrato.
//
// Reglas:
//  - Sin agentId → null (no hay a quién pagarle).
//  - percentage null/undefined o <= 0 → null (no se captura comisión).
//  - baseAmount = precio del contrato (totalPrice).
//  - commissionAmount = round2(baseAmount * percentage / 100).
// ────────────────────────────────────────────────────────────────────────────

export interface BuildCommissionInput {
  contractId: string;
  agentId?: string | null;
  percentage?: number | null;
  /** La comisión pactada en pesos. Si viene, manda sobre el porcentaje. */
  fixedAmount?: number | null;
  baseAmount: number;
}

export interface CommissionCreateData {
  contractId: string;
  agentId: string;
  commissionType: CommissionType;
  /** Uno de los dos viene lleno y el otro en null, según cómo se pactó. */
  percentage: number | null;
  fixedAmount: number | null;
  baseAmount: number;
  commissionAmount: number;
  status: CommissionStatus;
}

export function buildCommissionData(
  input: BuildCommissionInput,
): CommissionCreateData | null {
  // Sin agente asignado no hay a quién pagarle: no se crea comisión.
  if (!input.agentId) {
    return null;
  }

  const baseAmount = input.baseAmount;

  // La comisión se puede pactar como CANTIDAD o como porcentaje. El equipo
  // pidió poder teclear los pesos directo: con solo el porcentaje tenían que
  // sacar la cuenta al revés para llegar al monto acordado.
  const fixedAmount = input.fixedAmount ?? 0;
  if (fixedAmount > 0) {
    return {
      contractId: input.contractId,
      agentId: input.agentId,
      commissionType: CommissionType.SALE,
      percentage: null,
      fixedAmount: round2(fixedAmount),
      baseAmount,
      commissionAmount: round2(fixedAmount),
      status: CommissionStatus.PENDING,
    };
  }

  // Comisión manual: sin % tecleado (o <= 0) no se crea comisión.
  const percentage = input.percentage ?? 0;
  if (percentage <= 0) {
    return null;
  }

  return {
    contractId: input.contractId,
    agentId: input.agentId,
    commissionType: CommissionType.SALE,
    percentage,
    fixedAmount: null,
    baseAmount,
    commissionAmount: round2((baseAmount * percentage) / 100),
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
