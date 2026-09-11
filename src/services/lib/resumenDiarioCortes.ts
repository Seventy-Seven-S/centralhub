/**
 * Resumen del día: cuánto sumaron TODOS los cortes, una vez que cada quien
 * cerró el suyo.
 *
 * Lo importante no es el total sino saber si está completo. A las cinco de la
 * tarde casi siempre falta alguien por cerrar, y un total parcial leído como
 * final engaña — por eso el resumen lleva siempre cuántas faltan, y solo se
 * marca `completo` cuando todas las personas que cobraron ese día entregaron.
 */
import { round2 } from '../../utils/money';

export interface CorteDelDia {
  numero: number;
  cobradorId: string;
  cobrador: string;
  totalEfectivo: number;
  totalOtros: number;
  declarado: number;
  recibido: number | null;
  diferencia: number | null;
  status: 'PENDIENTE_ENTREGA' | 'RECIBIDO';
  pagos: number;
}

export interface ResumenDiario {
  fecha: string;
  cerrados: number;
  /** Personas que cobraron ese día y todavía no cierran su corte. */
  faltanPorCerrar: number;
  /** Cortes cerrados que el administrador aún no recibe. */
  pendientesDeEntrega: number;
  completo: boolean;
  totalEfectivo: number;
  totalOtros: number;
  totalDeclarado: number;
  totalRecibido: number;
  totalDiferencia: number;
  cortesConDiferencia: number;
  cortes: CorteDelDia[];
}

/**
 * @param cobradoresDelDia quiénes registraron cobros ese día. De ahí sale
 *        cuántas faltan por cerrar: sin este dato, un día con un solo corte
 *        parecería completo.
 */
export function construirResumenDiario(
  fecha: string,
  cortes: CorteDelDia[],
  cobradoresDelDia: string[],
): ResumenDiario {
  const ordenados = [...cortes].sort((a, b) => a.numero - b.numero);
  const cerraron = new Set(ordenados.map(c => c.cobradorId));
  const faltanPorCerrar = cobradoresDelDia.filter(id => !cerraron.has(id)).length;

  const suma = (f: (c: CorteDelDia) => number) => round2(ordenados.reduce((s, c) => s + f(c), 0));

  return {
    fecha,
    cerrados: ordenados.length,
    faltanPorCerrar,
    pendientesDeEntrega: ordenados.filter(c => c.status === 'PENDIENTE_ENTREGA').length,
    // Un día sin actividad no "cerró bien": no hubo nada que cerrar.
    completo: cobradoresDelDia.length > 0 && faltanPorCerrar === 0,
    totalEfectivo: suma(c => c.totalEfectivo),
    totalOtros: suma(c => c.totalOtros),
    totalDeclarado: suma(c => c.declarado),
    totalRecibido: suma(c => c.recibido ?? 0),
    totalDiferencia: suma(c => c.diferencia ?? 0),
    cortesConDiferencia: ordenados.filter(c => !!c.diferencia && Math.abs(c.diferencia) >= 0.5).length,
    cortes: ordenados,
  };
}
