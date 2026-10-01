// Lógica PURA de la edición de datos de un contrato por un ADMIN (sin Prisma).
//
// Los campos que aquí se validan son dinero: cambiarlos rehace el calendario de
// cuotas y mueve el balance. Antes se podían cambiar por el PUT genérico sin
// recalcular nada y sin dejar rastro — ese es el hueco que esto cierra.
import { round2 } from '../../utils/money';

export interface DatosActuales {
  totalPrice: number;
  downPayment: number;
  installmentAmount: number | null;
  installmentCount: number | null;
  startDate: Date | null;
  lotIds: string[];
}

export interface Edicion {
  totalPrice?: number;
  /** Enganche pactado. Se corrige cuando parte de lo que se registró como
   *  enganche en realidad abona mensualidades — pasó con F080, que tenía dos
   *  lotes, canceló uno y su enganche de $60,000 cubría los dos. */
  downPayment?: number;
  installmentAmount?: number;
  installmentCount?: number;
  /** Mes en que debe caer la PRIMERA mensualidad, como "2025-04". */
  mesInicioCalendario?: string;
  lotIds?: string[];
}

export interface Contexto {
  /** Suma de los pagos confirmados del contrato. */
  pagado: number;
  /** Fecha del primer pago de mensualidad, o null si aún no paga. */
  primerPago: Date | null;
  /** Lotes que el ADMIN quiere asignar pero que ya tienen otro contrato vivo. */
  lotesOcupadosPorOtros: string[];
}

const pesos = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * El calendario ancla en `startDate` y la cuota *i* vence en `startDate + i`
 * meses (ver buildCuotaRows). Para que la cuota 1 caiga en el mes que el ADMIN
 * indicó, el ancla es el MES ANTERIOR a ese.
 */
export function inicioDesdeMes(mes: string): Date {
  const [y, m] = mes.split('-').map(Number);
  return new Date(y, m - 2, 1);
}

/** Devuelve el mensaje de error, o null si la edición es válida. */
export function validarEdicion(actual: DatosActuales, e: Edicion, ctx: Contexto): string | null {
  if (e.totalPrice !== undefined) {
    if (e.totalPrice <= 0) return 'El precio total debe ser mayor a cero';
    if (round2(e.totalPrice) < round2(ctx.pagado)) {
      return `El precio total (${pesos(e.totalPrice)}) no puede ser menor a lo que el cliente ya pagó (${pesos(ctx.pagado)})`;
    }
  }
  if (e.downPayment !== undefined) {
    if (e.downPayment < 0) return 'El enganche no puede ser negativo';
    const precio = e.totalPrice ?? actual.totalPrice;
    if (round2(e.downPayment) > round2(precio)) {
      return `El enganche (${pesos(e.downPayment)}) no puede pasar del precio total (${pesos(precio)})`;
    }
  }
  if (e.installmentCount !== undefined && (!Number.isInteger(e.installmentCount) || e.installmentCount <= 0)) {
    return 'El plazo debe ser un número de meses mayor a cero';
  }
  if (e.installmentAmount !== undefined && e.installmentAmount <= 0) {
    return 'La mensualidad debe ser mayor a cero';
  }
  if (e.lotIds !== undefined) {
    if (e.lotIds.length === 0) return 'El contrato necesita al menos un lote';
    if (ctx.lotesOcupadosPorOtros.length > 0) {
      return `Ese lote ya pertenece a otro contrato vigente — si el cliente de verdad se cambió de lote, usa el traspaso`;
    }
  }
  if (e.mesInicioCalendario !== undefined) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.mesInicioCalendario)) return 'El mes de inicio debe venir como AAAA-MM';
    // NO se valida contra el primer pago. Un pago anterior al arranque del
    // calendario es un ADELANTO, que es normal: quien firma después del día 20
    // empieza a pagar un mes más tarde y a veces abona antes. El dinero se
    // aplica igual a la cuota 1. Bloquearlo impedía corregir ~60 contratos que
    // el equipo ya había revisado a mano.
  }
  return null;
}

export interface CampoCambiado { campo: string; valorAnterior: string | null; valorNuevo: string | null }

/** Solo los campos que de verdad cambian, para la bitácora. */
export function camposQueCambian(actual: DatosActuales, e: Edicion): CampoCambiado[] {
  const out: CampoCambiado[] = [];
  const num = (campo: keyof Edicion, antes: number | null) => {
    const nuevo = e[campo] as number | undefined;
    if (nuevo === undefined || round2(nuevo) === round2(antes ?? 0)) return;
    out.push({ campo, valorAnterior: antes === null ? null : String(antes), valorNuevo: String(nuevo) });
  };
  num('totalPrice', actual.totalPrice);
  num('downPayment', actual.downPayment);
  num('installmentAmount', actual.installmentAmount);
  num('installmentCount', actual.installmentCount);

  if (e.mesInicioCalendario !== undefined) {
    const antes = actual.startDate ? actual.startDate.toISOString().slice(0, 7) : null;
    const nuevo = inicioDesdeMes(e.mesInicioCalendario).toISOString().slice(0, 7);
    if (antes !== nuevo) out.push({ campo: 'startDate', valorAnterior: antes, valorNuevo: nuevo });
  }

  if (e.lotIds !== undefined) {
    const antes = [...actual.lotIds].sort().join(', ');
    const nuevo = [...e.lotIds].sort().join(', ');
    if (antes !== nuevo) out.push({ campo: 'lotIds', valorAnterior: antes || null, valorNuevo: nuevo || null });
  }
  return out;
}

/**
 * Montos de cada cuota del calendario nuevo.
 *
 * La última cuota SIEMPRE absorbe la diferencia para que el calendario sume
 * exactamente lo financiado. Sin esto, una mensualidad redondeada deja al
 * cliente debiendo de más y el saldo nunca llega a cero: el caso de Antelmo,
 * donde 72 cuotas de $3,473 suman $250,056 contra $250,000 financiados.
 */
export function montosDeCuotas(financiado: number, plazo: number, mensualidad?: number): number[] {
  if (plazo <= 0) return [];

  // Sin mensualidad capturada se reparte en PESOS REDONDOS, igual que al crear
  // el contrato (installmentSchedule): un solo criterio para las dos rutas.
  const base = mensualidad && mensualidad > 0 ? round2(mensualidad) : Math.round(financiado / plazo);
  const ultima = round2(financiado - base * (plazo - 1));
  if (ultima <= 0) {
    throw new Error(
      `Una mensualidad de ${pesos(base)} cubre lo financiado (${pesos(financiado)}) antes de las ${plazo} cuotas — ` +
      'revisa el plazo o el monto',
    );
  }
  if (ultima > base * 2) {
    throw new Error(
      `Una mensualidad de ${pesos(base)} no alcanza a cubrir ${pesos(financiado)} en ${plazo} meses: ` +
      `la última cuota tendría que ser de ${pesos(ultima)}`,
    );
  }

  const montos = Array.from({ length: plazo }, () => base);
  montos[plazo - 1] = ultima;
  return montos;
}

/**
 * Mensualidad que corresponde a un financiamiento y un plazo.
 *
 * Cuando se corrige SOLO el plazo, la mensualidad vieja deja de cuadrar: si el
 * equipo dice que el plazo son 50 meses, conservar los $11,600 de antes hace
 * que 50 cuotas pasen de lo financiado y la corrección se rechaza sola. La
 * mensualidad se deriva, salvo que la capturen explícitamente.
 */
export function mensualidadPara(
  financiado: number,
  plazo: number,
  mensualidadCapturada: number | undefined,
): number | null {
  if (mensualidadCapturada && mensualidadCapturada > 0) return round2(mensualidadCapturada);
  if (!plazo || plazo <= 0) return null;
  // En pesos redondos, igual que al crear el contrato.
  return Math.round(financiado / plazo);
}
