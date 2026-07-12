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
    // código en cualquier columna (hay hojas con columnas corridas)
    const cells = row.map(c => (c || '').toString().trim());
    const i = cells.findIndex(v => CODIGO_RE.test(v.toUpperCase()));
    if (i === -1) continue;
    const codigo = cells[i].toUpperCase();
    if (isDummy(codigo)) continue;
    hasCodigo = true;

    // Una fila de pago Resumen tiene EXACTAMENTE una celda de dinero después
    // del código ($ o número plano ≥ 100). Las tablas de estatus acumulado
    // ("Resumen Julio 2022" JSA1: Precio, Pagado, Remanente) tienen varias y
    // se ignoran; las filas diferidas ("Marzo") no tienen ninguna.
    const moneyIdxs: number[] = [];
    for (let c = i + 1; c < cells.length; c++) {
      const v = cells[c];
      if (v.startsWith('$') && parseMoney(v) > 0) moneyIdxs.push(c);
      else if (PLAIN_NUMBER_RE.test(v) && parseMoney(v) >= 100) moneyIdxs.push(c);
    }
    if (moneyIdxs.length !== 1) continue;
    const monto = parseMoney(cells[moneyIdxs[0]]);

    // concepto: la celda tipo "Manzana X Lote Y" si existe; si no, la hoja
    const conceptoCell = cells.find((v, idx) => idx !== i && /manzana|lote|fracci/i.test(v));
    pagos.push({ codigo, fecha, tipo: 'Mensualidad', concepto: conceptoCell || sheetName.trim(), monto });
  }

  if (pagos.length > 0) return { family: 'RESUMEN', pagos };
  return { family: hasCodigo ? 'DESCONOCIDA' : 'VACIA', pagos: [] };
}

const TIPO_RE = /^(mensualidad|enganche|abono|anticipo|apartado|deposito|depósito)\b/i;

// Hojas de fecha: una fila por pago con timestamp. Las columnas varían entre
// hojas (corridas +1, código primero, fecha en col 3…), así que las celdas
// clave se localizan por CONTENIDO, no por posición fija:
//   código = primera celda [A-Z]\d+ · fecha = primera celda M/D/YYYY
//   tipo   = primera celda con palabra de tipo (Mensualidad, Enganche…)
function readFechaSheet(rows: string[][]): JSASheetResult {
  const pagos: JSAPagoRow[] = [];
  let hasCodigo = false;
  let dollarRows = 0;
  let numericRows = 0;

  for (const row of rows) {
    if (!row || row.length < 3) continue;

    const cells = row.map(c => (c || '').toString().trim());
    const cIdx = cells.findIndex(v => CODIGO_RE.test(v.toUpperCase()));
    if (cIdx === -1) continue;
    const codigo = cells[cIdx].toUpperCase();
    if (isDummy(codigo)) continue;
    hasCodigo = true;

    const fIdx = cells.findIndex(v => SLASH_DATE_RE.test(v));
    const tIdx = cells.findIndex(v => TIPO_RE.test(v));
    // Una fila de pago de hoja-fecha tiene timestamp o celda de tipo; las filas
    // [nombre, código, $monto] de los Resumen mensuales no, y van al otro lector
    if (fIdx === -1 && tIdx === -1) continue;

    // 1) Monto con $: primera celda con "$" (después del código el $ del monto
    //    siempre precede al del balance)
    let monto = 0;
    let montoIdx = -1;
    let numeric = false;
    for (let c = cIdx + 1; c < cells.length; c++) {
      if (cells[c].startsWith('$')) {
        const parsed = parseMoney(cells[c]);
        if (parsed > 0) { monto = parsed; montoIdx = c; break; }
      }
    }

    // 2) Sin $: primera celda puramente numérica ≥ 100 después de la celda de
    //    tipo, saltando la fecha. Primera y no última porque hay hojas con
    //    columna de saldo DESPUÉS del monto ("Resumen Mayo 2 2023" JSA2);
    //    ≥ 100 para no confundir números de lote/manzana con el monto.
    //    Guardias anti-basura (lección FASTIDIO): esta vía exige que la fila
    //    tenga timestamp Y celda de tipo reconocible.
    if (monto <= 0 && fIdx !== -1 && tIdx !== -1) {
      for (let c = tIdx + 1; c < cells.length; c++) {
        if (c === fIdx) continue;
        if (PLAIN_NUMBER_RE.test(cells[c])) {
          const parsed = parseMoney(cells[c]);
          if (parsed >= 100) { monto = parsed; montoIdx = c; numeric = true; break; }
        }
      }
    }
    if (monto <= 0) continue;

    const fecha = fIdx !== -1 ? cells[fIdx] : '';
    let tipo: string;
    let concepto: string;
    if (tIdx !== -1) {
      tipo = cells[tIdx];
      // concepto = primera celda con contenido después del tipo que no sea la
      // fecha ni el monto (en el layout código-primero la fecha va en medio)
      concepto = '';
      for (let c = tIdx + 1; c < cells.length; c++) {
        if (c === fIdx || c === montoIdx) continue;
        if (cells[c]) { concepto = cells[c]; break; }
      }
    } else {
      // Sin celda de tipo (solo posible en la vía $): posicional como antes
      tipo = cells[cIdx + 1] || '';
      concepto = cells[cIdx + 2] || '';
    }

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

// Ajuste histórico: los enganches y pagos tempranos (2022) de JSA solo existen
// en los Excel como acumulados ("Enganches cobrados $1,131,000", tablas de
// Pagado por corte), nunca como filas de pago. Para que los balances no queden
// inflados se sintetiza UN pago por contrato con el residuo vs Directorio.Pagado.
// Tipo Enganche solo si el contrato no tiene ningún enganche parseado (el
// residuo temprano lo incluye); si ya tiene, va como Otro (EXTRA_PAYMENT).
export const AJUSTE_CONCEPTO = 'Ajuste histórico vs Directorio.Pagado';

export function calcularAjusteHistorico(
  pagadoDirectorio: number | undefined,
  pagadoParseado: number,
  tieneEnganche: boolean
): { monto: number; tipo: 'Enganche' | 'Otro' } | null {
  if (pagadoDirectorio === undefined) return null;
  const delta = pagadoDirectorio - pagadoParseado;
  if (delta <= 1) return null;
  return { monto: Math.round(delta * 100) / 100, tipo: tieneEnganche ? 'Otro' : 'Enganche' };
}

export function readJSAPaymentSheet(sheetName: string, rows: string[][]): JSASheetResult {
  const lower = sheetName.toLowerCase().trim();
  if (JSA_NON_PAYMENT_SHEETS.has(lower) || lower.startsWith('fastidio')) {
    return { family: 'NO_PAGO', pagos: [] };
  }
  if (isResumenName(sheetName)) {
    // Varias hojas "Resumen" son en realidad hojas de fecha (filas con
    // timestamp por pago) — intentar esa vía primero, que trae la fecha real
    const asFecha = readFechaSheet(rows);
    if (asFecha.pagos.length > 0) return asFecha;
    return readResumenSheet(sheetName, rows);
  }
  return readFechaSheet(rows);
}
