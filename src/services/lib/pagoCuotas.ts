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
  /** null cuando la cuota se queda SIN crédito: ya no tiene fecha de pago. */
  fechaPago: Date | null;
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
  // Un monto negativo RETIRA crédito: pasa cuando el cliente traspasa un lote
  // y se lleva su dinero, o cuando se le devuelve algo. Antes caía en el bucle
  // de abajo, que solo avanza con dinero positivo, y no hacía nada — el
  // calendario seguía mostrando cuotas pagadas con dinero que ya se fue.
  if (monto < 0) return retirarCredito(-monto, fechaPago, cuotas);

  const updates: CuotaUpdate[] = [];
  const startIdx = cuotas.findIndex(c => c.status !== 'PAGADA');
  if (startIdx === -1) return { updates, leftover: round2(monto) };

  // Todo en centavos redondeados: sin esto, restar 71 cuotas de 2222.22 deja
  // el pool en 2222.379999… y la última cuota (2222.38) quedaba PENDIENTE
  // con montoPagado === montoEsperado.
  let pool = round2(monto);
  for (let i = startIdx; i < cuotas.length && pool > 0; i++) {
    const c = cuotas[i];
    const needed = round2(c.montoEsperado - c.montoPagado);
    if (needed <= 0) continue;
    if (pool >= needed) {
      updates.push({ id: c.id, montoPagado: c.montoEsperado, fechaPago, status: 'PAGADA' });
      pool = round2(pool - needed);
    } else {
      updates.push({ id: c.id, montoPagado: round2(c.montoPagado + pool), fechaPago, status: 'PENDIENTE' });
      pool = 0;
    }
  }
  return { updates, leftover: pool };
}

/**
 * Quita `monto` de crédito, empezando por la última cuota con dinero y yendo
 * hacia atrás: lo que entró al final es lo primero que sale.
 *
 * El `leftover` sale negativo cuando se pidió retirar más crédito del que
 * había — eso se reporta, no se absorbe en silencio.
 */
function retirarCredito(monto: number, fechaPago: Date, cuotas: CuotaLike[]): AplicarPagoResult {
  const updates: CuotaUpdate[] = [];
  let porRetirar = round2(monto);

  for (let i = cuotas.length - 1; i >= 0 && porRetirar > 0; i--) {
    const c = cuotas[i];
    const disponible = round2(c.montoPagado);
    if (disponible <= 0) continue;

    const quita = Math.min(disponible, porRetirar);
    const queda = round2(disponible - quita);
    updates.push({
      id: c.id,
      montoPagado: queda,
      // CuotaLike no trae la fecha de pago previa; si queda crédito se sella
      // con la fecha del retiro, que es cuando de verdad cambió.
      fechaPago: queda > 0 ? fechaPago : null,
      status: queda >= round2(c.montoEsperado) ? 'PAGADA' : 'PENDIENTE',
    });
    porRetirar = round2(porRetirar - quita);
  }

  return { updates, leftover: round2(-porRetirar) };
}
