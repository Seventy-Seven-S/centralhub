export type CuotaStatus = 'PENDIENTE' | 'PAGADA' | 'MORA';

export interface Cuota {
  id: string;
  contractId: string;
  numeroCuota: number;
  mes: string;
  montoEsperado: number;
  montoPagado: number;
  fechaVencimiento: string;
  fechaPago: string | null;
  status: CuotaStatus;
}

export interface PayCuotaDto {
  montoPagado: number;
  fechaPago?: string;
}
