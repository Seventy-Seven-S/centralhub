// src/types/payment.types.ts
import { PaymentStatus, PaymentMethod } from '@prisma/client';

// DTO para registrar pago
export interface CreatePaymentDto {
  contractId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  installmentAmount?: number; // Monto que va a mensualidad
  extraAmount?: number; // Monto que va a saldo
  reference?: string;
  notes?: string;
}

// DTO para actualizar pago
export interface UpdatePaymentDto {
  amount?: number;
  paymentDate?: Date;
  paymentMethod?: PaymentMethod;
  status?: PaymentStatus;
  installmentAmount?: number;
  extraAmount?: number;
  reference?: string;
  notes?: string;
}

// Filtros para buscar pagos
export interface PaymentFilters {
  contractId?: string;
  clientId?: string;
  projectId?: string;
  status?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
}

// Respuesta de pago con relaciones
export interface PaymentResponse {
  id: string;
  contractId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  installmentAmount: number | null;
  extraAmount: number | null;
  reference: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  contract?: {
    id: string;
    contractNumber: string;
    balance: number | null;
    client: {
      id: string;
      firstName: string;
      lastName: string;
    };
  };
}