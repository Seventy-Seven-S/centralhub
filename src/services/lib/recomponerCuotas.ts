// Recompone el calendario de cuotas de UN contrato desde cero, a partir de
// sus pagos confirmados.
//
// Se diferencia de apply-payments-to-cuotas en una cosa deliberada: aquí SÍ se
// permite que una cuota ya PAGADA vuelva a PENDIENTE. Ese script hace backfill
// y un downgrade ahí siempre es un error de datos; este se usa cuando un pago
// se quita o se mueve de contrato, y entonces bajar la cuota es justamente lo
// que corresponde. Por eso vive aparte en vez de agregarle una bandera.
import { aplicarPagoACuotas } from './pagoCuotas';
import { round2 } from '../../utils/money';

export type EstadoCuota = 'PENDIENTE' | 'PAGADA';

export interface CuotaEnCalendario {
  id: string;
  numeroCuota: number;
  montoEsperado: number;
  montoPagado: number;
  status: EstadoCuota;
  fechaPago: Date | null;
}

export interface PagoAplicable {
  amount: number;
  paymentDate: Date;
}

export interface Recomposicion {
  /** El calendario completo como queda tras replicar todos los pagos. */
  cuotas: CuotaEnCalendario[];
  /** Solo las cuotas cuyo monto o estado difiere de como estaban. */
  cambios: CuotaEnCalendario[];
  /** Suma de lo aplicado al calendario. */
  totalPagado: number;
  /** Dinero que no cupo en ninguna cuota (nunca se descarta en silencio). */
  sobrante: number;
}

export function recomponerCuotas(
  pagos: PagoAplicable[],
  cuotas: CuotaEnCalendario[],
): Recomposicion {
  const estado: CuotaEnCalendario[] = cuotas.map(c => ({
    ...c, montoPagado: 0, status: 'PENDIENTE', fechaPago: null,
  }));

  let sobrante = 0;
  for (const pago of [...pagos].sort((a, b) => +a.paymentDate - +b.paymentDate)) {
    const { updates, leftover } = aplicarPagoACuotas(pago.amount, pago.paymentDate, estado);
    for (const u of updates) {
      const c = estado.find(x => x.id === u.id)!;
      c.montoPagado = u.montoPagado;
      c.status = u.status;
      c.fechaPago = u.fechaPago;
    }
    sobrante = round2(sobrante + leftover);
  }

  const previa = new Map(cuotas.map(c => [c.id, c]));
  const cambios = estado.filter(c => {
    const antes = previa.get(c.id)!;
    return round2(antes.montoPagado) !== round2(c.montoPagado) || antes.status !== c.status;
  });

  return {
    cuotas: estado,
    cambios,
    totalPagado: round2(estado.reduce((s, c) => s + c.montoPagado, 0)),
    sobrante,
  };
}

/**
 * Misma regla que aplica la cascada real al registrar un pago
 * (payment.service): mora = cuotas ya vencidas que siguen pendientes;
 * liquidado = balance en cero y ninguna cuota sin pagar.
 *
 * Se replica aquí porque un pago que se quita o se mueve también cambia el
 * estatus del contrato, y dejarlo con la mora vieja es tan incorrecto como
 * dejar el balance viejo.
 */
export function estadoDelContrato(
  balance: number,
  cuotas: Array<{ status: EstadoCuota; fechaVencimiento: Date }>,
  hoy: Date = new Date(),
): { status: 'ACTIVE' | 'IN_MORA' | 'COMPLETED'; moraMonthsCount: number } {
  const vencidas = cuotas.filter(c => c.status === 'PENDIENTE' && c.fechaVencimiento < hoy).length;
  const liquidado = balance <= 0.01 && cuotas.every(c => c.status === 'PAGADA');
  if (liquidado) return { status: 'COMPLETED', moraMonthsCount: 0 };
  return { status: vencidas > 0 ? 'IN_MORA' : 'ACTIVE', moraMonthsCount: vencidas };
}
