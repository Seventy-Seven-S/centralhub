/**
 * Serie de ingresos por mes para la gráfica del tablero.
 *
 * Incluye los meses SIN ingresos con total 0. Antes solo aparecían los meses
 * que tuvieron pagos, así que la gráfica comprimía el tiempo: un hueco de tres
 * meses se veía como si fueran consecutivos, y "últimos 6 meses" podía abarcar
 * ocho. Con la serie completa, cortar los últimos N elementos son exactamente
 * N meses de calendario.
 */
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export interface PuntoMensual {
  /** "YYYY-MM": ordenable y estable, para cortar rangos sin depender de la etiqueta. */
  periodo: string;
  /** "Ene 2026": lo que se ve en el eje. */
  mes: string;
  total: number;
}

const clave = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export function construirSerieMensual(
  pagos: Array<{ paymentDate: Date; amount: number | null }>,
  hasta: Date = new Date(),
): PuntoMensual[] {
  if (!pagos.length) return [];

  const suma = new Map<string, number>();
  let min = Infinity;
  for (const p of pagos) {
    const d = p.paymentDate;
    const k = clave(d);
    suma.set(k, (suma.get(k) ?? 0) + (p.amount ?? 0));
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    if (t < min) min = t;
  }

  // Se recorre mes a mes desde el primer pago hasta el mes de corte, en vez de
  // listar las claves que existen: así los huecos quedan en cero.
  const out: PuntoMensual[] = [];
  const cursor = new Date(min);
  const fin = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), 1);
  while (cursor.getTime() <= fin) {
    const k = clave(cursor);
    out.push({
      periodo: k,
      mes: `${MESES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
      total: suma.get(k) ?? 0,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}
