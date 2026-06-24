/**
 * ============================================================================
 * lib/lots.ts — Parsing puro + lectores de Excel para la CAPA DE LOTES
 * ============================================================================
 *
 * Módulo SIN dependencias de base de datos. Se encarga de:
 *   1. Parsear campos de lotes multi-valor ("10 y 11", "4,5,6,7", "21-22-23").
 *   2. Calcular el precio de un lote (total directo o Superficie × Precio/m²).
 *   3. Deducir el status de un lote (VENDIDO / DISPONIBLE / RESERVADO / ...).
 *   4. Leer las 3 fuentes de inventario de lotes:
 *        - Concentrado  (JSA 1/2/3): inventario COMPLETO.
 *        - Códigos      (los 12):    solo lotes VENDIDOS.
 *        - Plantilla becario:        inventario completo de los 9 restantes.
 *
 * Todo lo que toca la DB vive en migrate-lots.ts. Aquí solo se transforma Excel.
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';

export type LotStatusStr = 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'UNAVAILABLE';

export interface ParsedLot {
  manzana: number;
  lotNumber: string;
  areaM2: number;
  basePrice: number;
  currentPrice: number;
  status: LotStatusStr;
  /** Código de cliente (codigoLegado) si el lote está vendido y se conoce. */
  codigoLegado?: string;
  /** Nombre del cliente (informativo, para reportes). */
  clientName?: string;
}

// ============================================================================
// 1. PARSING DE LOTES MULTI-VALOR
// ============================================================================

/**
 * Convierte un campo "LOTE" crudo en la lista de números de lote que cubre.
 *   "5"            → [5]
 *   "10 y 11"      → [10, 11]
 *   "4,5,6,7"      → [4, 5, 6, 7]
 *   "21-22-23"     → [21, 22, 23]      (lista explícita separada por guiones)
 *   "21-24"        → [21, 22, 23, 24]  (rango ascendente de 2 extremos → se expande)
 *   "L3"           → [3]               (toma el primer número del token)
 *   ""             → []
 */
export function parseLoteNumbers(raw: string): number[] {
  const s = (raw || '').trim();
  if (!s) return [];

  // Separa primero por comas/puntos y por la conjunción "y".
  // (El punto aparece en hojas de Códigos como "7.8" = lotes 7 y 8.)
  const pieces = s
    .split(/\s*[,.]\s*|\s+y\s+|\s*\sy\s|\s*y\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: number[] = [];

  for (const piece of pieces) {
    if (piece.includes('-')) {
      const parts = piece
        .split('-')
        .map((x) => {
          const m = x.match(/\d+/);
          return m ? parseInt(m[0], 10) : NaN;
        })
        .filter((n) => !isNaN(n));

      // "A-B" ascendente con A<B → rango contiguo (p.ej. "21-24" = 21,22,23,24).
      if (parts.length === 2 && parts[1] > parts[0] && parts[1] - parts[0] <= 50) {
        for (let n = parts[0]; n <= parts[1]; n++) out.push(n);
      } else {
        // 3+ partes o no-ascendente → lista explícita ("21-22-23").
        out.push(...parts);
      }
    } else {
      const m = piece.match(/\d+/);
      if (m) out.push(parseInt(m[0], 10));
    }
  }

  // De-dup preservando orden.
  return [...new Set(out)];
}

// ============================================================================
// 2. CÁLCULO DE PRECIO
// ============================================================================

/** Limpia montos con formato "$125,000.00" → 125000. */
export function parseMoney(val: string | number | undefined): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(String(val).replace(/[$,\s]/g, '')) || 0;
}

/**
 * Determina el precio del lote:
 *   - Si hay precio total → ese.
 *   - Si solo hay precio/m² → Superficie_m2 × Precio_m2.
 *   - Si no hay nada → 0.
 */
export function computePrice(opts: { superficie?: number; precio?: number; precioM2?: number }): number {
  const precio = opts.precio || 0;
  if (precio > 0) return Math.round(precio * 100) / 100;

  const superficie = opts.superficie || 0;
  const precioM2 = opts.precioM2 || 0;
  if (superficie > 0 && precioM2 > 0) {
    return Math.round(superficie * precioM2 * 100) / 100;
  }
  return 0;
}

// ============================================================================
// 3. DEDUCCIÓN DE STATUS
// ============================================================================

/**
 * Status de la plantilla del becario:
 *   - Si "Estatus" trae un valor explícito (DISPONIBLE/VENDIDO/RESERVADO) → ese.
 *   - Si está vacío → VENDIDO si el lote empata un contrato migrado, si no AVAILABLE.
 */
export function deduceStatus(estatusRaw: string, hasContractMatch: boolean): LotStatusStr {
  const s = (estatusRaw || '').trim().toUpperCase();
  if (s) {
    if (s.startsWith('VEND') || s.includes('SOLD')) return 'SOLD';
    if (s.startsWith('RESERV') || s.includes('APARTAD')) return 'RESERVED';
    if (s.startsWith('DISPON') || s.includes('AVAIL') || s.includes('LIBRE')) return 'AVAILABLE';
    if (s.startsWith('NO ') || s.includes('UNAVAIL') || s.includes('DUEÑ') || s.includes('DUEN')) {
      return 'UNAVAILABLE';
    }
  }
  return hasContractMatch ? 'SOLD' : 'AVAILABLE';
}

/**
 * Status para una fila del Concentrado de JSA a partir del "Code" y "Estatus".
 *   Code D = Dueños (reservado por la inmobiliaria)  → UNAVAILABLE
 *   Code R = Reserva con documentación               → RESERVED
 *   Code F = Finiquitado / P = Proceso / M = Morosidad → SOLD
 *   Sin code → SOLD si hay nombre de cliente, si no AVAILABLE.
 */
export function jsaConcentradoStatus(code: string, estatus: string, hasClient: boolean): LotStatusStr {
  const c = (code || '').trim().toUpperCase();
  const e = (estatus || '').trim().toUpperCase();

  if (c === 'R' || e.includes('RESERVA')) return 'RESERVED';
  if (c === 'D' || e.includes('DUEÑO') || e.includes('DUENO') || e.includes('DUEÑOS')) return 'UNAVAILABLE';
  if (c === 'F' || c === 'P' || c === 'M' || e.includes('FINIQUIT') || e.includes('PROCESO') || e.includes('MOROS')) {
    return 'SOLD';
  }
  return hasClient ? 'SOLD' : 'AVAILABLE';
}

// ============================================================================
// HELPERS DE LECTURA DE EXCEL
// ============================================================================

function readGrid(ws: XLSX.WorkSheet): any[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
}

function findSheet(wb: XLSX.WorkBook, ...aliases: string[]): string | undefined {
  return wb.SheetNames.find((s) =>
    aliases.some((a) => s.trim().toLowerCase() === a.trim().toLowerCase())
  );
}

/** Índices de columnas por nombre flexible (case-insensitive, contiene). */
function colIndex(headers: string[], ...needles: string[]): number {
  const norm = headers.map((h) => (h || '').toString().trim().toUpperCase());
  for (const needle of needles) {
    const n = needle.toUpperCase();
    const exact = norm.findIndex((h) => h === n);
    if (exact !== -1) return exact;
  }
  for (const needle of needles) {
    const n = needle.toUpperCase();
    const partial = norm.findIndex((h) => h.includes(n));
    if (partial !== -1) return partial;
  }
  return -1;
}

const CODIGOS_SHEET_ALIASES = [
  'Códigos', 'Codigos', 'Códigos de Cliente', 'Codigos de Cliente',
  'Códigos de Clientes', 'Codigo de Cliente',
];

// ============================================================================
// 4a. LECTOR: Códigos de Cliente → mapa (manzana-lote) → codigoLegado
// ============================================================================

export interface CodigoEntry {
  codigo: string;
  manzana: number;
  lotes: number[];
  nombre: string;
}

/**
 * Lee la hoja "Códigos" / "Codigos de Cliente" y devuelve las entradas de venta.
 * Sirve tanto para SISTEMA (header fila 2) como JSA (header fila 3).
 */
export function readCodigos(excelPath: string): CodigoEntry[] {
  if (!fs.existsSync(excelPath)) throw new Error(`Excel no encontrado: ${excelPath}`);
  const wb = XLSX.readFile(excelPath);
  const sheet = findSheet(wb, ...CODIGOS_SHEET_ALIASES);
  if (!sheet) throw new Error(`No se encontró hoja de Códigos en ${excelPath}. Hojas: ${wb.SheetNames.join(', ')}`);

  const raw = readGrid(wb.Sheets[sheet]);

  // Detecta la fila de headers (busca CODIGO + MANZANA/FRACCION/LOTE).
  let headerRow = -1;
  for (let i = 0; i <= 5; i++) {
    const joined = (raw[i] || []).join(' ').toUpperCase();
    if ((joined.includes('CODIGO') || joined.includes('CÓDIGO')) && joined.includes('LOTE')) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) throw new Error(`No se detectó fila de headers en hoja "${sheet}"`);

  const headers: string[] = (raw[headerRow] || []).map((h: any) => (h ?? '').toString().trim());
  const codigoIdx = colIndex(headers, 'CODIGO DE CLIENTE ASIGNADO', 'CODIGO DE CLIENTE', 'CODIGO', 'CÓDIGO');
  const manzanaIdx = colIndex(headers, 'MANZANA', 'FRACCION', 'FRACCIÓN');
  const loteIdx = colIndex(headers, 'LOTE');
  const nombreIdx = colIndex(headers, 'NOMBRE  DE CLIENTE', 'NOMBRE DE CLIENTE', 'NOMBRE');

  if (codigoIdx === -1 || manzanaIdx === -1 || loteIdx === -1) {
    throw new Error(`Columnas faltantes en "${sheet}": codigo=${codigoIdx}, manzana=${manzanaIdx}, lote=${loteIdx}`);
  }

  const entries: CodigoEntry[] = [];
  for (let i = headerRow + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.every((c: any) => !c?.toString().trim())) continue;

    const codigo = (row[codigoIdx] ?? '').toString().trim().toUpperCase();
    if (!codigo || !/^[A-Z]+\d+$/.test(codigo)) continue;        // descarta estadísticas laterales
    if (/0{3}$/.test(codigo)) continue;                          // fila semilla X000

    const manzana = parseInt((row[manzanaIdx] ?? '').toString().trim(), 10) || 0;
    const loteRaw = (row[loteIdx] ?? '').toString().trim();
    const lotes = parseLoteNumbers(loteRaw);
    if (!manzana || lotes.length === 0) continue;

    entries.push({
      codigo,
      manzana,
      lotes,
      nombre: nombreIdx !== -1 ? (row[nombreIdx] ?? '').toString().trim() : '',
    });
  }

  return entries;
}

/** Mapa reverso "manzana-lote" → codigoLegado (para empatar inventario↔contrato). */
export function buildLotCodigoIndex(entries: CodigoEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entries) {
    for (const lote of e.lotes) {
      map.set(`${e.manzana}-${lote}`, e.codigo);
    }
  }
  return map;
}

// ============================================================================
// 4b. LECTOR: Códigos → lotes VENDIDOS (fuente 1)
// ============================================================================

/**
 * Deriva lotes VENDIDOS desde la hoja Códigos (todos los proyectos).
 * areaM2 y basePrice quedan en 0 (la hoja Códigos no trae m² ni precio por lote).
 */
export function readSoldLotsFromCodigos(excelPath: string): ParsedLot[] {
  const entries = readCodigos(excelPath);
  const lots: ParsedLot[] = [];
  const seen = new Set<string>();

  for (const e of entries) {
    for (const lote of e.lotes) {
      const key = `${e.manzana}-${lote}`;
      if (seen.has(key)) continue;     // mismo lote no se duplica aunque 2 códigos lo reclamen
      seen.add(key);
      lots.push({
        manzana: e.manzana,
        lotNumber: String(lote),
        areaM2: 0,
        basePrice: 0,
        currentPrice: 0,
        status: 'SOLD',
        codigoLegado: e.codigo,
        clientName: e.nombre,
      });
    }
  }

  return lots;
}

// ============================================================================
// 4c. LECTOR: Concentrado (JSA 1/2/3) → inventario COMPLETO (fuente 2)
// ============================================================================

const CONCENTRADO_HEADER_ROW = 7; // fila 8 (1-based) = índice 7

/**
 * Lee la hoja "Concentrado " (JSA). Devuelve TODOS los lotes con su m² (JSA1),
 * precio de venta y status (SOLD si hay cliente/Code de venta).
 * El codigoLegado se rellena después cruzando con el índice de Códigos.
 */
export function readLotsFromConcentrado(excelPath: string): ParsedLot[] {
  if (!fs.existsSync(excelPath)) throw new Error(`Excel no encontrado: ${excelPath}`);
  const wb = XLSX.readFile(excelPath);
  const sheet = findSheet(wb, 'Concentrado', 'Concentrado ');
  if (!sheet) throw new Error(`No se encontró hoja "Concentrado" en ${excelPath}. Hojas: ${wb.SheetNames.join(', ')}`);

  const raw = readGrid(wb.Sheets[sheet]);
  const headers: string[] = (raw[CONCENTRADO_HEADER_ROW] || []).map((h: any) => (h ?? '').toString().trim());

  const manzanaIdx = colIndex(headers, 'MANZANA');
  const loteIdx = colIndex(headers, 'LOTE');
  const m2Idx = colIndex(headers, 'M2', 'M²', 'SUPERFICIE');
  const nombreIdx = colIndex(headers, 'NOMBRE DEL CLIENTE', 'NOMBRE DEL CLIENTE');
  const codeIdx = colIndex(headers, 'CODE');
  const estatusIdx = colIndex(headers, 'ESTATUS');
  const precioIdx = colIndex(headers, 'PRECIO DE VENTA', 'PRECIO');

  if (manzanaIdx === -1 || loteIdx === -1) {
    throw new Error(`Concentrado sin columnas Manzana/Lote (headers: ${headers.join(' | ')})`);
  }

  const lots: ParsedLot[] = [];
  const seen = new Set<string>();

  for (let i = CONCENTRADO_HEADER_ROW + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.every((c: any) => !c?.toString().trim())) continue;

    const manzana = parseInt((row[manzanaIdx] ?? '').toString().trim(), 10) || 0;
    const loteRaw = (row[loteIdx] ?? '').toString().trim();
    const lote = parseInt(loteRaw, 10) || 0;
    if (!manzana || !lote) continue;     // filas de totales / vacías

    const key = `${manzana}-${lote}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const areaM2 = m2Idx !== -1 ? parseMoney((row[m2Idx] ?? '').toString()) : 0;
    const clientName = nombreIdx !== -1 ? (row[nombreIdx] ?? '').toString().trim() : '';
    const code = codeIdx !== -1 ? (row[codeIdx] ?? '').toString().trim() : '';
    const estatus = estatusIdx !== -1 ? (row[estatusIdx] ?? '').toString().trim() : '';
    const precio = precioIdx !== -1 ? parseMoney((row[precioIdx] ?? '').toString()) : 0;

    const status = jsaConcentradoStatus(code, estatus, !!clientName);

    lots.push({
      manzana,
      lotNumber: String(lote),
      areaM2,
      basePrice: precio,
      currentPrice: precio,
      status,
      clientName: clientName || undefined,
    });
  }

  return lots;
}

// ============================================================================
// 4d. LECTOR: Plantilla del becario (fuente 3)
// ============================================================================

/**
 * Plantilla del becario — una hoja, headers en fila 1:
 *   Proyecto | Manzana | Lote | Superficie_m2 | Precio | Precio_m2 | Estatus
 *
 * `matchesContract(manzana, lote)` permite deducir SOLD cuando "Estatus" viene
 * vacío y el lote empata un contrato migrado.
 */
export function readLotsFromTemplate(
  excelPath: string,
  opts: { projectFilter?: string; matchesContract?: (manzana: number, lote: number) => boolean } = {}
): ParsedLot[] {
  if (!fs.existsSync(excelPath)) throw new Error(`Excel no encontrado: ${excelPath}`);
  const wb = XLSX.readFile(excelPath);
  const sheet = wb.SheetNames[0];
  const raw = readGrid(wb.Sheets[sheet]);
  if (raw.length < 2) return [];

  const headers: string[] = (raw[0] || []).map((h: any) => (h ?? '').toString().trim());
  const proyectoIdx = colIndex(headers, 'PROYECTO');
  const manzanaIdx = colIndex(headers, 'MANZANA');
  const loteIdx = colIndex(headers, 'LOTE');
  const superficieIdx = colIndex(headers, 'SUPERFICIE_M2', 'SUPERFICIE', 'M2');
  const estatusIdx = colIndex(headers, 'ESTATUS', 'STATUS');

  // Precio (total) vs Precio_m2: ambos contienen "PRECIO", resolver por nombre exacto.
  const precioCol = headers.findIndex((h) => h.trim().toUpperCase() === 'PRECIO');
  const precioM2Col = headers.findIndex((h) => /PRECIO[_ /]?M2/i.test(h.trim()));

  const lots: ParsedLot[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.every((c: any) => !c?.toString().trim())) continue;

    const proyecto = proyectoIdx !== -1 ? (row[proyectoIdx] ?? '').toString().trim() : '';
    if (opts.projectFilter && proyecto && proyecto.toLowerCase() !== opts.projectFilter.toLowerCase()) {
      continue;
    }

    const manzana = parseInt((row[manzanaIdx] ?? '').toString().trim(), 10) || 0;
    // Tolera formatos "L-1" / "L3" igual que las otras fuentes (la plantilla
    // del becario usa una fila por lote → tomamos el primer número parseado).
    const lote = parseLoteNumbers((row[loteIdx] ?? '').toString().trim())[0] || 0;
    if (!manzana || !lote) continue;

    const key = `${manzana}-${lote}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const superficie = superficieIdx !== -1 ? parseMoney((row[superficieIdx] ?? '').toString()) : 0;
    const precio = precioCol !== -1 ? parseMoney((row[precioCol] ?? '').toString()) : 0;
    const precioM2 = precioM2Col !== -1 ? parseMoney((row[precioM2Col] ?? '').toString()) : 0;
    const price = computePrice({ superficie, precio, precioM2 });

    const estatusRaw = estatusIdx !== -1 ? (row[estatusIdx] ?? '').toString().trim() : '';
    const hasMatch = opts.matchesContract ? opts.matchesContract(manzana, lote) : false;
    const status = deduceStatus(estatusRaw, hasMatch);

    lots.push({
      manzana,
      lotNumber: String(lote),
      areaM2: superficie,
      basePrice: price,
      currentPrice: price,
      status,
    });
  }

  return lots;
}
