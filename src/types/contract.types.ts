// src/types/contract.types.ts
import { ContractStatus, PaymentMethod } from '@prisma/client';

// DTO para crear contrato
export interface CreateContractDto {
  clientId: string;
  projectId: string;
  lotIds: string[]; // Array de IDs de lotes a vincular
  downPayment: number;
  financedAmount: number;
  interestRate: number;
  termMonths: number; // 60, 72, 84 meses (5, 6, 7 años)
  monthlyPayment: number;
  startDate: Date;
  notes?: string;
}

// DTO para actualizar contrato
export interface UpdateContractDto {
  downPayment?: number;
  financedAmount?: number;
  interestRate?: number;
  termMonths?: number;
  monthlyPayment?: number;
  balance?: number;
  status?: ContractStatus;
  moraMonthsCount?: number;
  notes?: string;
}

// DTO para agregar co-titular
export interface AddCoOwnerDto {
  firstName: string;
  lastName: string;
  ine: string;
  estadoCivil?: string;
  lugarNacimiento?: string;
  isPrimary: boolean; // true si es el titular principal
}

// Filtros para buscar contratos
export interface ContractFilters {
  clientId?: string;
  projectId?: string;
  status?: ContractStatus;
  minBalance?: number;
  maxBalance?: number;
  startDateFrom?: Date;
  startDateTo?: Date;
}

// Respuesta de contrato con relaciones
export interface ContractResponse {
  id: string;
  contractNumber: string;
  clientId: string;
  projectId: string;
  downPayment: number;
  financedAmount: number;
  interestRate: number;
  termMonths: number;
  monthlyPayment: number;
  balance: number;
  status: ContractStatus;
  moraMonthsCount: number;
  startDate: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  client?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  project?: {
    id: string;
    code: string;
    name: string;
  };
  lots?: Array<{
    id: string;
    lotNumber: string;
    manzana: number;
    areaM2: number;
  }>;
  coOwners?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    ine: string;
    isPrimary: boolean;
  }>;
}