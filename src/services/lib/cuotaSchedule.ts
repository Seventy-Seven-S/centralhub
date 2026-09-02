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
 * Una fila por cuota. El vencimiento de la cuota i es startDate + i meses,
 * usando setMonth (rollover nativo de JS): un 29-ene + 1 mes cae en marzo en
 * año no bisiesto en vez de producir un 29-feb inválido.
 */
export function buildCuotaRows({ contractId, startDate, cuotaAmounts, idFactory = randomUUID }: BuildCuotaRowsInput): CuotaRow[] {
  return cuotaAmounts.map((montoEsperado, idx) => {
    const numeroCuota = idx + 1;
    const fechaVencimiento = new Date(startDate);
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + numeroCuota);
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
