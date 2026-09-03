// Construcción de las filas del calendario de cuotas — lógica PURA (sin Prisma).
// Única fuente de verdad para contract.service (creación de contrato) y
// payment.service (contratos migrados que llegaron sin calendario).
import { randomUUID } from 'crypto';

export interface CuotaRow {
  id: string;
  contractId: string;
  numeroCuota: number;
  mes: string;
  fechaVencimiento: Date;
  montoEsperado: number;
  montoPagado: number;
  status: 'PENDIENTE' | 'PAGADA';
}

export interface BuildCuotaRowsInput {
  contractId: string;
  startDate: Date;
  cuotaAmounts: number[];
  idFactory?: () => string;
}

/**
 * startDate + n meses calendario, recortando el día al último del mes destino
 * (31-ene + 1 → 28-feb, + 3 → 30-abr). NO usar setMonth: con día 29-31
 * desborda al mes siguiente y el calendario salta y repite meses (caso V205).
 */
export function addMonthsClamped(base: Date, months: number): Date {
  const y = base.getFullYear(), m = base.getMonth() + months, d = base.getDate();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d, lastDay), base.getHours(), base.getMinutes(), base.getSeconds());
}

/** Una fila por cuota. El vencimiento de la cuota i es startDate + i meses calendario. */
export function buildCuotaRows({ contractId, startDate, cuotaAmounts, idFactory = randomUUID }: BuildCuotaRowsInput): CuotaRow[] {
  return cuotaAmounts.map((montoEsperado, idx) => {
    const numeroCuota = idx + 1;
    const fechaVencimiento = addMonthsClamped(startDate, numeroCuota);
    return {
      id: idFactory(),
      contractId,
      numeroCuota,
      mes: fechaVencimiento.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }),
      fechaVencimiento,
      montoEsperado,
      montoPagado: 0,
      status: 'PENDIENTE',
    };
  });
}
