/**
 * gastosSistemaViejo.ts — lector de la hoja "Gastos" del sistema viejo.
 *
 * Estructura distinta a la de los archivos "Etapa N": aquí cada renglón ES un
 * gasto (concepto + fecha) y el monto cae en la columna de su categoría. Una
 * misma fila puede repartirse entre dos categorías ("Nora Caballero / Central"),
 * y entonces son dos gastos, no uno.
 *
 * Lo que NO se carga se devuelve aparte en vez de descartarse en silencio: un
 * gasto que desaparece sin avisar es peor que uno que no se cargó.
 */

export interface GastoLeido {
  concepto: string;
  fecha: Date;
  /** Nombre de la columna tal cual viene en el archivo. */
  etiqueta: string;
  /** Categoría de la app. */
  categoria: string;
  monto: number;
}

export interface LecturaGastos {
  gastos: GastoLeido[];
  /** Concepto y fecha pero ninguna columna con monto. */
  sinMonto: string[];
  /** Monto con concepto pero sin fecha: cargarlo lo pondría en otro periodo. */
  sinFecha: Array<{ concepto: string; etiqueta: string; monto: number }>;
  /** Monto sin concepto: no hay cómo describirlo. */
  sinConcepto: Array<{ etiqueta: string; monto: number }>;
  /** Monto en una columna sin encabezado (el archivo guarda ahí un ajuste). */
  sinColumna: Array<{ concepto: string; monto: number; columna: number }>;
}

/** Nombre de la columna del archivo → categoría de gasto en la app. */
export function categoriaDeColumnaGasto(columna: string): string {
  const s = columna.trim().toLowerCase();
  // Caballero es el apellido del dueño del terreno de Santander; se unifica con
  // la categoría que ya usan los proyectos JSA para el mismo concepto.
  if (s.startsWith('caballero')) return 'Dueño del terreno';
  // El arquitecto agrupó planos, trazo y maquinaria en una sola categoría.
  if (s.startsWith('planos')) return 'Planos, Trazo y Maquinaria';
  if (s.startsWith('maquinaria')) return 'Planos, Trazo y Maquinaria';
  if (s.startsWith('central')) return 'Central';
  // "Oficina2" en el archivo; en la app la categoría ya existe con espacio.
  if (s.startsWith('oficina')) return 'Oficina 2';
  return columna.trim();
}

const esSerialExcel = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 40000 && v < 60000;

export const fechaDeSerial = (s: number) =>
  new Date(Date.UTC(1899, 11, 30) + Math.round(s * 86400000));

/** Recibe la matriz cruda; la primera fila es el encabezado. */
export function leerGastosDeMatriz(rows: unknown[][]): LecturaGastos {
  const H = (rows[0] ?? []).map(c => (typeof c === 'string' ? c.trim() : ''));
  const cConcepto = H.findIndex(h => /^concepto$/i.test(h));
  const cFecha = H.findIndex(h => /^fecha$/i.test(h));
  if (cConcepto < 0 || cFecha < 0) throw new Error('La hoja no tiene columnas Concepto y Fecha');

  const columnas = H
    .map((h, i) => ({ h, i }))
    .filter(c => c.h && c.i !== cConcepto && c.i !== cFecha);
  const conEncabezado = new Set(columnas.map(c => c.i));

  const out: LecturaGastos = { gastos: [], sinMonto: [], sinFecha: [], sinConcepto: [], sinColumna: [] };

  for (const r of rows.slice(1)) {
    const concepto = typeof r[cConcepto] === 'string' ? r[cConcepto].trim() : '';

    // Montos en columnas SIN encabezado: el archivo mete ahí un ajuste negativo
    // que no es un gasto. Se reporta y no se carga.
    r.forEach((v, i) => {
      if (i === cConcepto || i === cFecha || conEncabezado.has(i)) return;
      const n = Number(v);
      if (Number.isFinite(n) && n !== 0 && concepto) out.sinColumna.push({ concepto, monto: n, columna: i });
    });

    const montos = columnas
      .map(c => ({ etiqueta: c.h, monto: Number(r[c.i]) }))
      .filter(x => Number.isFinite(x.monto) && x.monto !== 0);

    if (!concepto) {
      // La fila de totales no trae concepto y repite TODAS las columnas: no es
      // un gasto suelto, así que solo se reporta cuando toca una sola columna.
      if (montos.length === 1) out.sinConcepto.push(montos[0]);
      continue;
    }
    if (!montos.length) { out.sinMonto.push(concepto); continue; }
    if (!esSerialExcel(r[cFecha])) {
      for (const m of montos) out.sinFecha.push({ concepto, ...m });
      continue;
    }

    const fecha = fechaDeSerial(r[cFecha]);
    for (const m of montos) {
      out.gastos.push({ concepto, fecha, etiqueta: m.etiqueta, categoria: categoriaDeColumnaGasto(m.etiqueta), monto: m.monto });
    }
  }
  return out;
}

/**
 * Qué gastos del archivo todavía no están en la base.
 *
 * Se compara por FECHA + MONTO y nada más. El archivo se reedita: entre
 * versiones cambian los nombres de las categorías ("Despacho" → "Oficina2",
 * "Sueldos"+"Varios" → "Administrativos") y los conceptos se reescriben. Meter
 * esos campos en la comparación haría que cada versión reinsertara todo el
 * historial duplicado.
 *
 * El conteo importa: tres pagos de $3,000 el mismo día son tres gastos, así que
 * cada coincidencia se consume en vez de solo preguntar si existe.
 */
export function faltantesContra<T extends { fecha: Date; monto: number }>(
  delArchivo: T[],
  enBase: Array<{ date: Date; amount: number | string }>,
): T[] {
  const clave = (f: Date, m: number) => `${f.toISOString().slice(0, 10)}|${m.toFixed(2)}`;
  const disponibles = new Map<string, number>();
  for (const e of enBase) {
    const k = clave(e.date, Number(e.amount));
    disponibles.set(k, (disponibles.get(k) ?? 0) + 1);
  }
  return delArchivo.filter(g => {
    const k = clave(g.fecha, g.monto);
    const n = disponibles.get(k) ?? 0;
    if (n > 0) { disponibles.set(k, n - 1); return false; }
    return true;
  });
}
