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
    if (ctx.primerPago) {
      // La cuota 1 vence un mes después del ancla.
      const primeraCuota = inicioDesdeMes(e.mesInicioCalendario);
      primeraCuota.setMonth(primeraCuota.getMonth() + 1);
      const mesPago = new Date(ctx.primerPago.getFullYear(), ctx.primerPago.getMonth(), 1);
      if (primeraCuota > mesPago) {
        return 'El calendario no puede arrancar después del primer pago que el cliente ya hizo';
      }
    }
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
