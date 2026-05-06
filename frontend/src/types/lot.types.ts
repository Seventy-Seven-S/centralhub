export type LotStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'UNAVAILABLE';

export interface Lot {
  id: string;
  projectId: string;
  manzana: number;
  lotNumber: string;
  areaM2: number;
  status: LotStatus;
  basePrice: number;
  currentPrice: number;
}
