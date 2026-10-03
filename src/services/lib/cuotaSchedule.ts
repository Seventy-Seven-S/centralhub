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
  // TODO en UTC. Con métodos de hora local, una fecha guardada a medianoche
  // UTC daba un mes distinto según dónde corriera el código: en México el
  // ancla 2025-05-01 producía la cuota 1 el 31 de MAYO, y en el servidor el 1
  // de JUNIO. Un calendario no puede depender de la laptop que lo rearma.
  const y = base.getUTCFullYear(), m = base.getUTCMonth() + months, d = base.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    y, m, Math.min(d, lastDay),
    base.getUTCHours(), base.getUTCMinutes(), base.getUTCSeconds(),
  ));
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
      // timeZone UTC: sin esto, una cuota que vence el día 1 se etiquetaba con
      // el mes ANTERIOR, porque la fecha retrocede un día al leerse en México.
      // Es el texto que lee el equipo, y por el que reportaron meses malos.
      mes: fechaVencimiento.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      fechaVencimiento,
      montoEsperado,
      montoPagado: 0,
      status: 'PENDIENTE',
    };
  });
}
