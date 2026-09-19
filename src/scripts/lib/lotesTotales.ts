// Lector de "LOTES TOTALES .xlsx" — el inventario completo que lleva el
// arquitecto, una hoja por proyecto.
//
// Cada hoja tiene encabezados distintos y en filas distintas, así que las
// columnas se buscan por nombre en vez de por posición. Debajo de los lotes
// reales las hojas traen cientos de filas de relleno con manzana y lote
// numerados pero sin nada más: el estatus es lo que distingue un lote de verdad.
import * as XLSX from 'xlsx';

export type EstadoLote = 'SOLD' | 'AVAILABLE' | 'RESERVED' | 'UNAVAILABLE';

export const norm = (s: unknown) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

export function aNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return String(v ?? '').trim() === '' || !Number.isFinite(n) ? null : n;
}

/**
 * Estatus del archivo al estado del lote en la app.
 *
 * Los que no son inventario vendible quedan como UNAVAILABLE: ISASI son los
 * lotes que se quedó el dueño del terreno en los JSA, RESACA es terreno
 * inundable en Magnolia, A EQUIPAMIENTO es la donación al municipio y ROGELIO
 * es un apartado del dueño en Bugambilias.
 *
 * Un estatus desconocido devuelve null a propósito: adivinar metería basura al
 * inventario sin que nadie se entere.
 */
export function estatusALote(estatus: string): EstadoLote | null {
  const e = norm(estatus);
  if (!e) return null;
  if (e === 'VENDIDO') return 'SOLD';
  if (e === 'DISPONIBLE') return 'AVAILABLE';
  if (e === 'SEPARADO') return 'RESERVED';
  if (['ISASI', 'ISASSI', 'RESACA', 'A EQUIPAMIENTO', 'ROGELIO'].includes(e)) return 'UNAVAILABLE';
  return null;
}

const indiceDe = (head: string[], ...alternativas: string[]) => {
  for (const a of alternativas) {
    const i = head.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
};

/** Una fila es un lote real si trae manzana, lote y estatus. */
export function esFilaDeLote(fila: unknown[], head: string[]): boolean {
  const iM = indiceDe(head, 'MZA', 'MANZANA');
  const iL = indiceDe(head, 'LOTE');
  const iE = indiceDe(head, 'ESTATUS');
  return aNumero(fila?.[iM]) !== null && aNumero(fila?.[iL]) !== null && norm(fila?.[iE]) !== '';
}

export interface LoteDelArchivo {
  hoja: string;
  manzana: number;
  lote: string;
  estatusTexto: string;
  estado: EstadoLote | null;
  precio: number | null;
  codigoCliente: string | null;
  cliente: string | null;
}

export function leerLotesTotales(ruta: string): LoteDelArchivo[] {
  const wb = XLSX.readFile(ruta);
  const out: LoteDelArchivo[] = [];

  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true }) as unknown[][];
    const iHead = filas.findIndex(f => f?.some(c => norm(c) === 'ESTATUS'));
    if (iHead === -1) continue;
    const head = (filas[iHead] as unknown[]).map(norm);

    const iM = indiceDe(head, 'MZA', 'MANZANA');
    const iL = indiceDe(head, 'LOTE');
    const iE = indiceDe(head, 'ESTATUS');
    const iC = indiceDe(head, 'CODIGO DE CLIENTE ASIGNADO', 'CODIGO DE CLIENTE ASIGNADO (K)', 'CODIGO');
    const iN = indiceDe(head, 'CLIENTE ACTUAL', 'NOMBRE DE CLIENTE', 'CLIENTE');
    // "PRECIO INICIAL" es el que pidió el negocio; las hojas que no lo tienen
    // usan su única columna de precio.
    const iP = indiceDe(head, 'PRECIO INICIAL') >= 0
      ? indiceDe(head, 'PRECIO INICIAL')
      : indiceDe(head, 'PRECIO', 'PRECIO/VENTA');

    for (const fila of filas.slice(iHead + 1)) {
      if (!esFilaDeLote(fila, head)) continue;
      const estatusTexto = norm(fila[iE]);
      out.push({
        hoja,
        manzana: aNumero(fila[iM])!,
        // lotNumber es texto en la app: "13", no 13.
        lote: String(aNumero(fila[iL])),
        estatusTexto,
        estado: estatusALote(estatusTexto),
        precio: aNumero(fila[iP]),
        codigoCliente: norm(fila[iC]) || null,
        cliente: fila[iN] ? String(fila[iN]).trim() : null,
      });
    }
  }
  return out;
}

/** Hoja del archivo al nombre del proyecto en la app. */
export const HOJA_A_PROYECTO: Record<string, string> = {
  'V.ROBLE':          'Valle del Roble',
  'MONARCA':          'Monarca I',
  'MONARCA 2':        'Monarca II',
  'V. BUGAMBILIAS':   'Valle de Bugambilias',
  'MAGNOLIA ':        'Magnolia del Sur',
  'JSA-1':            'JSA 1',
  'JSA-2':            'JSA 2',
  'JSA-3':            'JSA 3',
  'JSA-4':            'JSA 4',
  'SANTANDER':        'Santander',
  'PUERTA DEL SOL ':  'Puerta del Sol',
};

/**
 * Valle del Roble escribe "1920" cuando los lotes 19 y 20 se vendieron como
 * una sola unidad, con la nota "Se vendió como un solo lote". En la app son dos
 * lotes separados, que es lo correcto; el archivo es el que los junta.
 *
 * Devuelve las dos mitades cuando el número es de cuatro dígitos, no existe
 * como lote por sí mismo, y sus mitades sí existen y son consecutivas. Si no,
 * null — no se adivina.
 */
export function partirLoteFusionado(lote: string, lotesQueExisten: Set<string>): [string, string] | null {
  if (!/^\d{4}$/.test(lote)) return null;
  if (lotesQueExisten.has(lote)) return null;

  const a = String(Number(lote.slice(0, 2)));
  const b = String(Number(lote.slice(2)));
  if (Number(b) - Number(a) !== 1) return null;
  if (!lotesQueExisten.has(a) || !lotesQueExisten.has(b)) return null;
  return [a, b];
}
