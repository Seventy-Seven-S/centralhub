// src/types/lot.types.ts
import { LotStatus, Orientation } from '@prisma/client';

// DTOs para crear lote
export interface CreateLotDto {
  projectId: string;
  manzana: number;
  lotNumber: string;
  areaM2: number;
  orientation?: Orientation;
  basePrice: number;
  currentPrice: number;
  features?: any; // JSON flexible para características del lote
}

// DTOs para actualizar lote
export interface UpdateLotDto {
  manzana?: number;
  lotNumber?: string;
  areaM2?: number;
  orientation?: Orientation;
  basePrice?: number;
  currentPrice?: number;
  status?: LotStatus;
  features?: any;
}

// DTO para apartar lote
export interface ReserveLotDto {
  reservationDeposit: number; // 0 (palabra) o 5000 (con pago)
  expiryWeeks: number; // 1 (palabra) o 3 (con pago)
}

// Filtros para buscar lotes
export interface LotFilters {
  projectId?: string;
  status?: LotStatus;
  manzana?: number;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
}

// Respuesta de lote con relaciones
export interface LotResponse {
  id: string;
  projectId: string;
  manzana: number;
  lotNumber: string;
  areaM2: number;
  orientation: Orientation | null;
  basePrice: number;
  currentPrice: number;
  status: LotStatus;
  reservedAt: Date | null;
  reservationExpiry: Date | null;
  reservationDeposit: number | null;
  features: any;
  createdAt: Date;
  updatedAt: Date;
  project?: {
    id: string;
    code: string;
    name: string;
  };
  contracts?: Array<{
    id: string;
    contractNumber: string;
    client: {
      id: string;
      firstName: string;
      lastName: string;
    };
  }>;
}