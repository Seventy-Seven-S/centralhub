/**
 * Reglas del corte diario — lógica PURA (sin Prisma), para poder probarlas
 * sin base de datos.
 *
 * Contexto: cinco personas cobran en campo y al cerrar el día entregan el
 * efectivo al administrador. El corte es el papel que acompaña esa entrega.
 *
 * Decisiones de negocio que viven aquí:
 *  - El efectivo es el eje. Transferencias y cheques se muestran aparte
 *    porque NO vienen en la mano: cuadrarlos contra el sobre no tiene sentido.
 *  - Una diferencia al recibir NO bloquea: se registra con nota obligatoria.
 *    Trabar el cierre del día por $300 deja a la cobradora sin poder cerrar y
 *    el dinero sin entregar, que es peor que registrar el faltante.
 */
import { round2 } from '../../utils/money';

export interface PagoDelDia {
  amount: number;
  paymentMethod: string;
  proyectoCode: string;
  proyectoNombre: string;
}

export interface ResumenDia {
  totalEfectivo: number;
  totalOtros: number;
  pagosEfectivo: number;
  pagosOtros: number;
  porProyecto: Array<{ code: string; nombre: string; efectivo: number; pagos: number }>;
}

const ES_EFECTIVO = (m: string) => m === 'CASH';

/** Totales y desglose por proyecto. El desglose NO se guarda: se deriva. */
export function resumirDia(pagos: PagoDelDia[]): ResumenDia {
  const efectivo = pagos.filter(p => ES_EFECTIVO(p.paymentMethod));
  const otros = pagos.filter(p => !ES_EFECTIVO(p.paymentMethod));

  const acc = new Map<string, { code: string; nombre: string; efectivo: number; pagos: number }>();
  for (const p of efectivo) {
    const e = acc.get(p.proyectoCode) ?? { code: p.proyectoCode, nombre: p.proyectoNombre, efectivo: 0, pagos: 0 };
    e.efectivo = round2(e.efectivo + p.amount);
    e.pagos += 1;
    acc.set(p.proyectoCode, e);
  }

  return {
    totalEfectivo: round2(efectivo.reduce((a, p) => a + p.amount, 0)),
    totalOtros: round2(otros.reduce((a, p) => a + p.amount, 0)),
    pagosEfectivo: efectivo.length,
    pagosOtros: otros.length,
    porProyecto: [...acc.values()].sort((a, b) => b.efectivo - a.efectivo),
  };
}

/** Mensaje de error, o null si el cierre es válido. */
export function validarCierre(f: { declarado: number; totalEfectivo: number; pagos: number }): string | null {
  if (f.pagos === 0) return 'No puedes cerrar un día sin cobros registrados';
  if (!Number.isFinite(f.declarado) || f.declarado < 0) return 'El monto declarado no puede ser negativo';
  return null;
}

export interface Recepcion {
  diferencia: number;
  error: string | null;
}

/**
 * Lo que pasa cuando el administrador cuenta el dinero. La diferencia se
 * redondea a pesos antes de compararla contra cero para que un centavo de
 * error de punto flotante no dispare la nota obligatoria.
 */
export function calcularRecepcion(f: { declarado: number; recibido: number; notaAdmin: string }): Recepcion {
  if (!Number.isFinite(f.recibido) || f.recibido < 0) {
    return { diferencia: 0, error: 'El monto recibido no puede ser negativo' };
  }
  const diferencia = round2(f.recibido - f.declarado);
  // Menos de un peso es ruido de redondeo, no un faltante.
  const hayDiferencia = Math.abs(diferencia) >= 0.5;
  if (hayDiferencia && !f.notaAdmin?.trim()) {
    return { diferencia, error: 'Hay una diferencia: explica en la nota a qué se debe' };
  }
  return { diferencia: hayDiferencia ? diferencia : 0, error: null };
}
