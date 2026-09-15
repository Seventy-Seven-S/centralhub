/**
 * Totales de dinero de un proyecto.
 *
 * Existe para que "los ingresos de un proyecto" se definan UNA vez. Estaban
 * calculados por separado en el listado de proyectos, el detalle y el resumen
 * del tablero, y al agregar los ingresos que no vienen de un cliente hubo que
 * tocar los tres — con la pantalla de detalle quedándose desfasada mientras
 * tanto. Cualquier cambio futuro a la definición se hace aquí.
 */
import { round2 } from '../../utils/money';

export interface EntradasTotales {
  /** Suma de los pagos confirmados de clientes. */
  pagos: number | string | null;
  /** Aportaciones que no vienen de un cliente (dueño del terreno, etc.). */
  otros: number | string | null;
  egresos: number | string | null;
}

export interface TotalesProyecto {
  totalIngresos: number;
  otrosIngresos: number;
  totalEgresos: number;
  diferencia: number;
}

// Prisma entrega Decimal como texto; sumarlo sin convertir concatena.
const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));

export function componerTotales(e: EntradasTotales): TotalesProyecto {
  const otrosIngresos = round2(num(e.otros));
  const totalIngresos = round2(num(e.pagos) + otrosIngresos);
  const totalEgresos  = round2(num(e.egresos));
  return { totalIngresos, otrosIngresos, totalEgresos, diferencia: round2(totalIngresos - totalEgresos) };
}
