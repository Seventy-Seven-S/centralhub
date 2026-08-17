// Cascada de pago sobre cuotas — lógica PURA (sin Prisma).
// Única fuente de verdad; la usan payment.service, cuota.service y el script
// de reconciliación apply-payments-to-cuotas.
import { round2 } from '../../utils/money';

export interface CuotaLike {
  id: string;
  montoEsperado: number;
  montoPagado: number;
  status: 'PENDIENTE' | 'PAGADA';
}

export interface CuotaUpdate {
  id: string;
  montoPagado: number;
  fechaPago: Date;
  status: 'PENDIENTE' | 'PAGADA';
}

export interface AplicarPagoResult {
  updates: CuotaUpdate[];
  // > 0 cuando el monto excede la suma de TODAS las cuotas pendientes — el
  // caller (payment.service) decide qué hacer (Tanda 1: rechazar el pago).
  leftover: number;
}

/**
 * Drena `monto` sobre las cuotas en orden, empezando en la primera no PAGADA
 * (respetando su montoPagado previo), adelantando cuotas futuras según haga
 * falta. La cuota que no alcanza a cerrarse queda PENDIENTE con el acumulado.
 * Si el monto excede la suma de TODAS las cuotas, lo que sobra se reporta en
 * `leftover` — NUNCA se descarta silenciosamente.
 */
export function aplicarPagoACuotas(monto: number, fechaPago: Date, cuotas: CuotaLike[]): AplicarPagoResult {
  const updates: CuotaUpdate[] = [];
  const startIdx = cuotas.findIndex(c => c.status !== 'PAGADA');
  if (startIdx === -1) return { updates, leftover: round2(monto) };

  let pool = monto;
  for (let i = startIdx; i < cuotas.length && pool > 0; i++) {
    const c = cuotas[i];
    const needed = c.montoEsperado - c.montoPagado;
    if (needed <= 0) continue;
    if (pool >= needed) {
      updates.push({ id: c.id, montoPagado: c.montoEsperado, fechaPago, status: 'PAGADA' });
      pool -= needed;
    } else {
      updates.push({ id: c.id, montoPagado: c.montoPagado + pool, fechaPago, status: 'PENDIENTE' });
      pool = 0;
    }
  }
  return { updates, leftover: round2(pool) };
}
