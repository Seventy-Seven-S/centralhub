// Separar un lote de un contrato que tiene varios, para que quede en su propio
// contrato.
//
// Caso que lo originó: Erik de Jesús Silva tenía dos lotes en un solo contrato
// (V110) y traspasó uno. No había forma de partirlo. No es raro: 211 de los
// 1,403 contratos vivos tienen más de un lote, uno de ellos ocho.
//
// La regla que no se negocia: EL DINERO SE REPARTE, NO SE COPIA. Lo que el
// cliente pagó entró una sola vez y debe seguir contando una sola vez, así que
// la suma de los dos contratos resultantes es siempre igual a lo que había.
//
// El reparto proporcional al precio es una SUGERENCIA. Quien captura decide,
// porque el acuerdo real con el cliente no siempre es proporcional.
import { round2 } from '../../utils/money';

export interface LoteDelContrato {
  lotId: string;
  /** Lo que ese lote costó dentro del contrato (priceAtSale). */
  precio: number;
}

export interface ContratoADividir {
  totalPrice: number;
  downPayment: number;
  installmentCount: number | null;
  /** Suma de los pagos confirmados. */
  pagado: number;
  lotes: LoteDelContrato[];
}

export interface Division {
  lotId: string;
  /** Precio que se lleva el contrato nuevo. */
  precioQueSeVa: number;
  /** Dinero ya pagado que se le acredita al contrato nuevo. */
  montoQueSeVa: number;
}

export interface LadoDeLaDivision {
  precio: number;
  pagado: number;
  balance: number;
}

export interface ResultadoDivision {
  nuevo: LadoDeLaDivision;
  original: LadoDeLaDivision;
}

/** Punto de partida que se le propone a quien captura: en proporción al precio. */
export function repartoSugerido(c: ContratoADividir, lotId: string): { precioQueSeVa: number; montoQueSeVa: number } {
  const lote = c.lotes.find(l => l.lotId === lotId);
  const precioQueSeVa = round2(lote?.precio ?? 0);
  const proporcion = c.totalPrice > 0 ? precioQueSeVa / c.totalPrice : 0;
  return { precioQueSeVa, montoQueSeVa: round2(c.pagado * proporcion) };
}

/** Devuelve el mensaje de error, o null si la división es válida. */
export function validarDivision(c: ContratoADividir, d: Division): string | null {
  if (c.lotes.length < 2) return 'Este contrato tiene un solo lote: no hay nada que separar';
  if (!c.lotes.some(l => l.lotId === d.lotId)) return 'Ese lote no pertenece a este contrato';

  if (d.precioQueSeVa <= 0) return 'El precio del lote que se separa debe ser mayor a cero';
  if (d.precioQueSeVa >= c.totalPrice) {
    return 'El precio que se lleva no puede ser todo el contrato: al original no le quedaría nada';
  }
  if (d.montoQueSeVa < 0) return 'El monto que se lleva no puede ser negativo';
  if (round2(d.montoQueSeVa) > round2(c.pagado)) {
    return `No se puede llevar más de lo que el cliente ha pagado (${c.pagado})`;
  }

  const r = componerDivision(c, d);
  if (r.nuevo.balance < -0.01 || r.original.balance < -0.01) {
    return 'Con ese reparto uno de los dos contratos quedaría con saldo negativo — ajusta el precio o el monto';
  }
  return null;
}

/** Cómo queda cada lado. La suma siempre reproduce el contrato original. */
export function componerDivision(c: ContratoADividir, d: Division): ResultadoDivision {
  const precioNuevo = round2(d.precioQueSeVa);
  const pagadoNuevo = round2(d.montoQueSeVa);
  const precioOriginal = round2(c.totalPrice - precioNuevo);
  const pagadoOriginal = round2(c.pagado - pagadoNuevo);

  return {
    nuevo:    { precio: precioNuevo,    pagado: pagadoNuevo,    balance: round2(precioNuevo - pagadoNuevo) },
    original: { precio: precioOriginal, pagado: pagadoOriginal, balance: round2(precioOriginal - pagadoOriginal) },
  };
}

export interface PagoADividir {
  id: string;
  amount: number;
  concept: string;
}

export interface PagoRepartido {
  id: string;
  alNuevo: number;
  alOriginal: number;
}

/**
 * Reparte los pagos ya recibidos entre los dos contratos.
 *
 * Cada pago se parte en la misma proporción, y el ÚLTIMO absorbe el centavo
 * que sobra para que lo repartido sume exactamente lo que había. Sin ese
 * ajuste, el redondeo de cada parte haría aparecer o desaparecer pesos: el
 * dinero entró una vez y tiene que seguir cuadrando al centavo.
 */
export function repartirPagos(pagos: PagoADividir[], montoAlNuevo: number): PagoRepartido[] {
  const total = round2(pagos.reduce((s, p) => s + p.amount, 0));
  const objetivo = round2(Math.max(0, Math.min(montoAlNuevo, total)));
  if (pagos.length === 0) return [];

  const proporcion = total > 0 ? objetivo / total : 0;

  let acumulado = 0;
  return pagos.map((p, i) => {
    const esUltimo = i === pagos.length - 1;
    // El último toma lo que falte para llegar al objetivo exacto.
    const alNuevo = esUltimo
      ? round2(Math.max(0, Math.min(p.amount, objetivo - acumulado)))
      : round2(p.amount * proporcion);
    acumulado = round2(acumulado + alNuevo);
    return { id: p.id, alNuevo, alOriginal: round2(p.amount - alNuevo) };
  });
}
