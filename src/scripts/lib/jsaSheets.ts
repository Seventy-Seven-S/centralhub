/**
 * Lectores de hojas de pago de los Excel JSA (formato C: sin hoja "Ingresos").
 *
 * Cada hoja se clasifica en una familia explícita con lector propio; una hoja
 * que no calza en ninguna familia se reporta (DESCONOCIDA) en vez de adivinarse
 * con heurísticas — lección de los 90 pagos fantasma de las hojas FASTIDIO.
 *
 * Familias:
 *  - NO_PAGO         hoja administrativa (Directorio, Capturas, FASTIDIO…)
 *  - FECHA_DOLAR     hoja de corte: [timestamp, código, tipo, concepto, …, $monto, …]
 *  - FECHA_NUMERICA  igual pero con montos como número plano (50000) — el monto
 *                    es la ÚLTIMA celda puramente numérica y se exige timestamp
 *                    válido en col 0 (guardia anti-FASTIDIO)
 *  - RESUMEN         resumen mensual 2022-2023: [nombre, código, $monto] sin
 *                    fecha por fila; la fecha sale de la fila "CORTE" o del
 *                    nombre de la hoja ("Resumen Enero 2022")
 *  - DESCONOCIDA     tiene códigos de cliente pero nada recuperable → revisar
 *  - VACIA           sin códigos de cliente (portadas, notas)
 */

export type JSAFamily =
  | 'NO_PAGO'
  | 'FECHA_DOLAR'
  | 'FECHA_NUMERICA'
  | 'RESUMEN'
  | 'DESCONOCIDA'
  | 'VACIA';

export interface JSAPagoRow {
  codigo: string;
  fecha: string;
  tipo: string;
  concepto: string;
  monto: number;
}

export interface JSASheetResult {
  family: JSAFamily;
  pagos: JSAPagoRow[];
}

// Hojas no-pago en archivos JSA (todo lo demás se trata como hoja de pagos)
export const JSA_NON_PAYMENT_SHEETS = new Set([
  'codigos de cliente', 'directorio', 'directorio.d', 'capturas', 'concentrado ', 'concentrado',
  'layout', 'config', 'bitacora', 'nvscriptsproperties', 'do not delete - autocrat job se',
  'clientes con contrato mal', 'retenidos campana', 'presidencia', 'presidencia pagos',
  'prospectación', 'prospectacion', 'mapa', 'hoja cobranza ', 'hoja cobranza',
  'lineamientos generales', 'ref1', 'ref2', 'cc1', 'cc2', 'r.cortes', 'r.propiedad',
  'r.cliente', 'r.aportes1', 'r.aportes2', 'r2', 'reporte.1', 'retencion campana', 'hoja 22',
]);

const SPANISH_MONTHS: Record<string, number> = {
  'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
  'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
  'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11,
};

const CODIGO_RE = /^[A-Z]\d+$/;
// Timestamp/fecha al inicio de celda: "9/16/2023 12:41:52" o "9/16/2023"
const SLASH_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}/;
// Celda puramente numérica: "50000", "3,542.50" (sin $, sin texto)
const PLAIN_NUMBER_RE = /^\d[\d,]*(\.\d+)?$/;

function isDummy(codigo: string): boolean {
  return /0{3}$/.test(codigo);
}

function parseMoney(val: string): number {
  return parseFloat(val.replace(/[$,\s]/g, '')) || 0;
}

function toISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function isResumenName(name: string): boolean {
  return /^\s*(resumen|abonos)\b/i.test(name);
}

// "Resumen Enero 2022" → 2022-01-01 (fallback cuando no hay fila CORTE)
function dateFromSheetName(name: string): string | null {
  const m = name.toLowerCase().match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})/);
  if (!m) return null;
  return toISODate(new Date(parseInt(m[2]), SPANISH_MONTHS[m[1]], 1));
}

// Busca la fila "CORTE <fecha>" del encabezado ("7 February 2022", inglés)
function findCorteDate(rows: string[][]): string | null {
  for (const row of rows.slice(0, 15)) {
    if (!row) continue;
    const idx = row.findIndex(c => /^corte\b/i.test((c || '').trim()));
    if (idx === -1) continue;
    for (let j = idx + 1; j < row.length; j++) {
      const cell = (row[j] || '').trim();
      if (!cell) continue;
      const d = new Date(cell);
      if (!isNaN(d.getTime())) return toISODate(d);
    }
  }
  return null;
}

function readResumenSheet(sheetName: string, rows: string[][]): JSASheetResult {
  const fecha = findCorteDate(rows) ?? dateFromSheetName(sheetName) ?? '';
  const pagos: JSAPagoRow[] = [];
  let hasCodigo = false;

  for (const row of rows) {
    if (!row) continue;
    // código en cualquier columna (hay hojas con columnas corridas); el monto
    // debe estar en la celda INMEDIATA siguiente y con formato $ — las filas
    // diferidas traen el mes ("Marzo") en esa celda y se ignoran
    const i = row.findIndex(c => CODIGO_RE.test((c || '').trim().toUpperCase()));
    if (i === -1) continue;
    const codigo = row[i].trim().toUpperCase();
    if (isDummy(codigo)) continue;
    hasCodigo = true;

    const montoCell = (row[i + 1] || '').trim();
    if (!montoCell.startsWith('$')) continue;
    const monto = parseMoney(montoCell);
    if (monto <= 0) continue;

    pagos.push({ codigo, fecha, tipo: 'Mensualidad', concepto: sheetName.trim(), monto });
  }

  if (pagos.length > 0) return { family: 'RESUMEN', pagos };
  return { family: hasCodigo ? 'DESCONOCIDA' : 'VACIA', pagos: [] };
}

function readFechaSheet(rows: string[][]): JSASheetResult {
  const pagos: JSAPagoRow[] = [];
  let hasCodigo = false;
  let dollarRows = 0;
  let numericRows = 0;

  for (const row of rows) {
    if (!row || row.length < 3) continue;

    const codigo = (row[1] || '').toString().trim().toUpperCase();
    if (!CODIGO_RE.test(codigo)) continue;
    if (isDummy(codigo)) continue;
    hasCodigo = true;

    const fecha = (row[0] || '').toString().trim();
    const tipo = (row[2] || '').toString().trim();
    const concepto = (row[3] || '').toString().trim();

    // 1) Monto con $: primera celda ≥2 que empiece con "$" (comportamiento original)
    let monto = 0;
    let numeric = false;
    for (let c = 2; c < row.length; c++) {
      const val = (row[c] || '').toString().trim();
      if (val.startsWith('$')) { monto = parseMoney(val); break; }
    }

    // 2) Sin $: última celda puramente numérica, SOLO si col 0 es una fecha
    //    válida (las hojas basura tipo FASTIDIO no tienen timestamp en col 0)
    if (monto <= 0 && SLASH_DATE_RE.test(fecha)) {
      for (let c = row.length - 1; c >= 2; c--) {
        const val = (row[c] || '').toString().trim();
        if (PLAIN_NUMBER_RE.test(val)) {
          const parsed = parseMoney(val);
          if (parsed > 0) { monto = parsed; numeric = true; break; }
        }
      }
    }

    if (monto <= 0) continue;
    if (numeric) numericRows++; else dollarRows++;
    pagos.push({ codigo, fecha, tipo, concepto, monto });
  }

  if (pagos.length > 0) {
    return { family: dollarRows > 0 ? 'FECHA_DOLAR' : 'FECHA_NUMERICA', pagos };
  }
  return { family: hasCodigo ? 'DESCONOCIDA' : 'VACIA', pagos: [] };
}

export type ReconVeredicto = 'OK' | 'PARSEADO_MENOR' | 'PARSEADO_MAYOR' | 'SIN_DIRECTORIO';

// Compara lo que reporta Directorio.Pagado contra la suma de pagos parseados.
// delta = pagadoDirectorio - pagadoParseado (positivo = nos falta historial;
// negativo = parseamos de más, posible doble conteo). Tolerancia: $1.
export function reconciliarContrato(
  pagadoDirectorio: number | undefined,
  pagadoParseado: number
): { delta: number | null; veredicto: ReconVeredicto } {
  if (pagadoDirectorio === undefined) return { delta: null, veredicto: 'SIN_DIRECTORIO' };
  const delta = pagadoDirectorio - pagadoParseado;
  if (Math.abs(delta) <= 1) return { delta, veredicto: 'OK' };
  return { delta, veredicto: delta > 0 ? 'PARSEADO_MENOR' : 'PARSEADO_MAYOR' };
}

export function readJSAPaymentSheet(sheetName: string, rows: string[][]): JSASheetResult {
  const lower = sheetName.toLowerCase().trim();
  if (JSA_NON_PAYMENT_SHEETS.has(lower) || lower.startsWith('fastidio')) {
    return { family: 'NO_PAGO', pagos: [] };
  }
  if (isResumenName(sheetName)) return readResumenSheet(sheetName, rows);
  return readFechaSheet(rows);
}
