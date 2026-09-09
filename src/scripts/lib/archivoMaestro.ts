/**
 * Lector del archivo maestro de las secretarias:
 *   backups/PRECIO,  SUPERFICIE, MENSUALIDAD.xlsx
 *
 * Es el archivo que ellas armaron a partir de los contratos firmados, y la
 * fuente de verdad de la MENSUALIDAD, el PRECIO y la SUPERFICIE. Una hoja por
 * proyecto, una fila por LOTE — un contrato con varios lotes aparece repetido
 * bajo el mismo código de cliente.
 *
 * Las hojas no comparten formato: el encabezado está en la fila 0, 1 o 2 según
 * la hoja, y las columnas cambian de nombre y de posición. Por eso el
 * encabezado se localiza buscando la celda "CODIGO DE CLIENTE" y las columnas
 * se resuelven por nombre, nunca por índice fijo.
 */
import * as XLSX from 'xlsx';

export const ARCHIVO_MAESTRO = 'backups/PRECIO,  SUPERFICIE, MENSUALIDAD.xlsx';

/** Nombre de hoja → código de proyecto en la app. */
export const HOJA_A_PROYECTO: Record<string, string> = {
  'V.ROBLE': 'VDR',
  'MONARCA': 'MON1',
  'MONARCA 2': 'MON2',
  'V. BUGAMBILIAS': 'VDB',
  'BETANIA': 'BET',
  'MAGNOLIA': 'MDS',
  'JSA-1': 'JSA1',
  'JSA-2': 'JSA2',
  'JSA-3': 'JSA3',
  'JSA-4': 'JSA4',
};

export interface FilaLote {
  codigo: string;
  proyecto: string;
  hoja: string;
  manzana: string | null;
  lote: string | null;
  cliente: string | null;
  /** null cuando la celda dice "DE CONTADO", trae guion o viene vacía. */
  mensualidad: number | null;
  precio: number | null;
  m2: number | null;
  /** Texto crudo del plazo: puede ser un número de años o "DE CONTADO". */
  plazoTexto: string | null;
  deContado: boolean;
  observaciones: string | null;
}

const norm = (v: any) => String(v ?? '').trim().toUpperCase();

/**
 * Convierte una celda a número. Tolera "$4,687.50", espacios y guiones.
 * Devuelve null para vacíos, guiones y textos no numéricos ("DE CONTADO"),
 * en vez de NaN o 0 — un 0 aquí se confundiría con "mensualidad cero".
 */
export function aNumero(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || s === '-' || s === '—') return null;
  const limpio = s.replace(/[$,\s]/g, '');
  if (!/^-?\d*\.?\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Índice de la fila de encabezado, o -1. Se busca "CODIGO DE CLIENTE". */
export function encontrarEncabezado(rows: any[][]): number {
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const celdas = (rows[i] ?? []).map(norm);
    // "CODIGO DE CLIENTE" en casi todas las hojas; V.ROBLE titula solo
    // "CODIGO" y por eso se quedaba fuera (436 contratos de VDR invisibles).
    if (celdas.some(c => c.startsWith('CODIGO DE CLIENT') || c === 'CODIGO')) return i;
  }
  return -1;
}

export function leerHoja(rows: any[][], hoja: string, proyecto: string): FilaLote[] {
  const h = encontrarEncabezado(rows);
  if (h < 0) return [];

  const headers = (rows[h] ?? []).map(norm);
  const buscar = (pred: (s: string) => boolean) => headers.findIndex(pred);

  const cCodigo = buscar(s => s.startsWith('CODIGO DE CLIENT'));
  const cCodigoSolo = buscar(s => s === 'CODIGO');
  const iCodigo = cCodigo >= 0 ? cCodigo : cCodigoSolo;
  const cCliente = buscar(s => s.includes('NOMBRE'));
  const cMza = buscar(s => s.startsWith('MANZANA') || s.startsWith('FRACCION') || s === 'MZA');
  const cLote = buscar(s => s === 'LOTE');
  const cPlazo = buscar(s => s.includes('PLAZO'));
  const cMens = buscar(s => s.includes('MENSUALIDAD'));
  const cM2 = buscar(s => s === 'M2' || s.includes('SUPERFICIE'));
  const cPrecio = buscar(s => s.includes('PRECIO'));
  const cObs = buscar(s => s.includes('OBSERVACIONES'));

  const out: FilaLote[] = [];
  for (const r of rows.slice(h + 1)) {
    const codigo = norm(r?.[iCodigo]);
    if (!codigo) continue;

    const plazoTexto = cPlazo >= 0 && r[cPlazo] != null ? String(r[cPlazo]).trim() : null;
    out.push({
      codigo,
      proyecto,
      hoja,
      manzana: cMza >= 0 && r[cMza] != null ? String(r[cMza]).trim() : null,
      lote: cLote >= 0 && r[cLote] != null ? String(r[cLote]).trim() : null,
      cliente: cCliente >= 0 && r[cCliente] != null ? String(r[cCliente]).trim() : null,
      mensualidad: cMens >= 0 ? aNumero(r[cMens]) : null,
      precio: cPrecio >= 0 ? aNumero(r[cPrecio]) : null,
      m2: cM2 >= 0 ? aNumero(r[cM2]) : null,
      plazoTexto,
      deContado: norm(plazoTexto).includes('CONTADO'),
      observaciones: cObs >= 0 && r[cObs] != null ? String(r[cObs]).trim() || null : null,
    });
  }
  return out;
}

export function leerArchivoMaestro(ruta = ARCHIVO_MAESTRO): FilaLote[] {
  const wb = XLSX.readFile(ruta);
  const out: FilaLote[] = [];
  for (const hoja of wb.SheetNames) {
    const proyecto = HOJA_A_PROYECTO[hoja.trim().toUpperCase()] ?? HOJA_A_PROYECTO[hoja.trim()];
    if (!proyecto) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: null }) as any[][];
    out.push(...leerHoja(rows, hoja, proyecto));
  }
  return out;
}

export interface ContratoArchivo {
  codigo: string;
  proyecto: string;
  lotes: number;
  /** Mensualidad del CONTRATO = suma de las de sus lotes. Ver agruparPorCodigo. */
  mensualidad: number | null;
  /** Lotes del contrato cuya fila venía sin mensualidad (la suma queda corta). */
  lotesSinMensualidad: number;
  precioTotal: number | null;
  m2Total: number | null;
  deContado: boolean;
  clientes: string[];
}

/**
 * Agrupa las filas por código de cliente (= contrato).
 *
 * Convención: cada fila es un LOTE, y su PRECIO, M2 y MENSUALIDAD son de ese
 * lote. Los tres se SUMAN para obtener los del contrato.
 *
 * Verificado contra producción: A071 tiene 5 lotes y su mensualidad en la BD
 * es $19,166.67 = 5 × $3,833.33, que es el valor repetido en las 5 filas del
 * archivo. Lo mismo en 20 casos revisados de 5 proyectos distintos. Tomar el
 * valor repetido en vez de la suma le bajaría la mensualidad al cliente
 * tantas veces como lotes tenga.
 */
export function agruparPorCodigo(filas: FilaLote[]): Map<string, ContratoArchivo> {
  const porCodigo = new Map<string, FilaLote[]>();
  for (const f of filas) {
    const k = `${f.proyecto}|${f.codigo}`;
    (porCodigo.get(k) ?? porCodigo.set(k, []).get(k)!).push(f);
  }

  const out = new Map<string, ContratoArchivo>();
  for (const [k, fs] of porCodigo) {
    const mens = fs.map(f => f.mensualidad).filter((n): n is number => n !== null);
    const precios = fs.map(f => f.precio).filter((n): n is number => n !== null);
    const m2s = fs.map(f => f.m2).filter((n): n is number => n !== null);

    out.set(k, {
      codigo: fs[0].codigo,
      proyecto: fs[0].proyecto,
      lotes: fs.length,
      mensualidad: mens.length ? Math.round(mens.reduce((a, b) => a + b, 0) * 100) / 100 : null,
      lotesSinMensualidad: fs.length - mens.length,
      precioTotal: precios.length ? precios.reduce((a, b) => a + b, 0) : null,
      m2Total: m2s.length ? Math.round(m2s.reduce((a, b) => a + b, 0) * 1000) / 1000 : null,
      deContado: fs.every(f => f.deContado),
      clientes: [...new Set(fs.map(f => f.cliente).filter((s): s is string => !!s))],
    });
  }
  return out;
}

/** Redondeo al peso mayor inmediato: 4570.15 → 4571, 4570 → 4570. */
export function alPesoMayor(n: number): number {
  return Math.ceil(Math.round(n * 100) / 100);
}
