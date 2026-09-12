/**
 * etapaGastos.ts — lector de los archivos "Etapa N.xlsx" del sistema viejo.
 *
 * Cada archivo trae una hoja de cortes: un renglón por fecha de reparto, con
 * "Abonos" (lo cobrado en el periodo) y luego el desglose de a dónde se fue ese
 * dinero. Cada columna del desglose se convierte en un gasto del proyecto.
 *
 * La columna del dueño cambia de nombre entre archivos ("E1 - Jesus y Maribel",
 * "Gpe. Antonio Isassi", "Mensualidad"), pero siempre significa lo mismo: lo
 * que se le entregó al dueño del terreno.
 *
 * "Dinero Adelantado" NO es un gasto: es un saldo a favor/en contra que el
 * archivo arrastra, y trae negativos. Se ignora.
 */
import * as XLSX from 'xlsx';

export interface RepartoEtapa {
  fecha: Date;
  abonos: number;
  /** categoría de la app → monto */
  reparto: Array<{ categoria: string; monto: number; etiqueta: string }>;
}

export interface LecturaEtapa {
  hoja: string;
  repartos: RepartoEtapa[];
  ignoradas: string[];
}

const IGNORAR = /dinero\s+adelantado|^abonos?$|^fecha$|^$/i;

/** Nombre de columna → categoría de gasto en la app. */
export function categoriaDeColumna(col: string, duenoEtiqueta?: string): string {
  const s = col.trim().toLowerCase();
  if (duenoEtiqueta && s === duenoEtiqueta.trim().toLowerCase()) return 'Dueño del terreno';
  if (s === 'mensualidad') return 'Dueño del terreno';
  if (s.startsWith('central')) return 'Central';
  if (s.startsWith('oficina')) return 'Oficina 2';
  if (s.startsWith('notar')) return 'Notaría';
  if (s.startsWith('plano')) return 'Planos';
  if (s.startsWith('limpieza')) return 'Limpieza';
  if (s.startsWith('presidencia')) return 'Presidencia';
  if (s.startsWith('asesor')) return 'Asesores';
  // Nombre propio (el dueño) en archivos donde no viene "Mensualidad".
  return 'Dueño del terreno';
}

const esFechaSerial = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 40000 && v < 60000;

export const fechaDeSerial = (s: number) =>
  new Date(Date.UTC(1899, 11, 30) + Math.round(s * 86400000));

/** Encuentra la hoja de cortes: la que tiene un encabezado con "Fecha" y "Abonos". */
export function leerEtapa(ruta: string): LecturaEtapa {
  const wb = XLSX.readFile(ruta);
  for (const hoja of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: null }) as unknown[][];
    const iHdr = rows.findIndex(r =>
      r.some(c => typeof c === 'string' && /^\s*fecha\s*$/i.test(c)) &&
      r.some(c => typeof c === 'string' && /^\s*abonos?\s*$/i.test(c)));
    if (iHdr < 0) continue;

    const hdr = rows[iHdr] as (string | null)[];
    const cFecha = hdr.findIndex(c => typeof c === 'string' && /^\s*fecha\s*$/i.test(c));
    const cAbonos = hdr.findIndex(c => typeof c === 'string' && /^\s*abonos?\s*$/i.test(c));

    const columnas = hdr
      .map((c, i) => ({ i, nombre: typeof c === 'string' ? c.trim() : '' }))
      .filter(c => c.nombre && !IGNORAR.test(c.nombre) && c.i !== cFecha && c.i !== cAbonos);

    const repartos: RepartoEtapa[] = [];
    for (const r of rows.slice(iHdr + 1)) {
      if (!esFechaSerial(r[cFecha])) continue;
      const abonos = Number(r[cAbonos]) || 0;
      const reparto = columnas
        .map(c => ({
          categoria: categoriaDeColumna(c.nombre),
          etiqueta: c.nombre,
          monto: Number(r[c.i]) || 0,
        }))
        // Un 0 no es un gasto; un negativo en el desglose sería un dato raro
        // del archivo y no se inventa un gasto negativo.
        .filter(x => x.monto > 0);
      if (!reparto.length && abonos === 0) continue;
      repartos.push({ fecha: fechaDeSerial(r[cFecha] as number), abonos, reparto });
    }

    const ignoradas = hdr.filter((c): c is string =>
      typeof c === 'string' && c.trim() !== '' && IGNORAR.test(c.trim()) && !/^\s*(fecha|abonos?)\s*$/i.test(c));

    return { hoja, repartos, ignoradas };
  }
  throw new Error(`No encontré hoja de cortes en ${ruta}`);
}
