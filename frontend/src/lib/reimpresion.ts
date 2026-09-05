// Reimpresión de recibos: reconstruye las props de <ReciboContrato> desde el
// snapshot inmutable (ReciboLog) que se guardó al emitir, para que el folio,
// la cuota, el monto y el saldo salgan idénticos al recibo original.

export interface ReciboLogSnapshot {
  id: string;
  paymentId: string;
  folio: string;
  numeroCuota: number;
  mes: string;
  plazoTotal: number;
  montoPagado: number;
  fechaPago: string;
  concepto: string;
  balanceDespues: number;
}

export interface ReciboReimpresionProps {
  cuota: { numeroCuota: number; mes: string };
  pago: { montoPagado: number; fechaPago: string; concepto: string };
  balanceDespues: number;
  plazoTotal?: number;
}

export function reciboPropsDesdeLog(log: ReciboLogSnapshot): ReciboReimpresionProps {
  return {
    cuota: { numeroCuota: log.numeroCuota, mes: log.mes },
    pago: { montoPagado: log.montoPagado, fechaPago: log.fechaPago, concepto: log.concepto },
    balanceDespues: log.balanceDespues,
    plazoTotal: log.plazoTotal,
  };
}

interface PagoLike { id: string; amount: number; paymentDate: string; concept: string; balanceAfter: number | null }
interface CuotaLike { numeroCuota: number; mes: string; fechaPago?: string | null }

/**
 * Fallback para pagos sin recibo emitido (migrados o cuyo log falló):
 * número de cuota desde el concepto ("Mensualidad #14 …"), o la primera
 * cuota pagada en esa misma fecha; si no hay forma de saberlo, 0.
 */
export function reciboPropsDesdePago(pago: PagoLike, cuotas: CuotaLike[]): ReciboReimpresionProps {
  const m = /#\s*(\d+)/.exec(pago.concept ?? '');
  let cuota: CuotaLike | undefined;
  if (m) cuota = cuotas.find(c => c.numeroCuota === Number(m[1])) ?? { numeroCuota: Number(m[1]), mes: '' };
  if (!cuota) {
    const dia = (pago.paymentDate ?? '').slice(0, 10);
    cuota = cuotas.find(c => (c.fechaPago ?? '').slice(0, 10) === dia);
  }
  return {
    cuota: { numeroCuota: cuota?.numeroCuota ?? 0, mes: cuota?.mes ?? '' },
    pago: { montoPagado: pago.amount, fechaPago: pago.paymentDate, concepto: pago.concept },
    balanceDespues: pago.balanceAfter ?? 0,
  };
}
