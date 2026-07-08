/**
 * ============================================================================
 * migrate-project.ts — ETL XLSX → PostgreSQL (genérico para los 12 proyectos)
 * ============================================================================
 *
 * PROPÓSITO
 *   Migra los datos transaccionales (clientes, contratos, pagos, cuotas) de un
 *   Excel "template Central Inmobiliaria" a la base de datos de CentralHub.
 *   Funciona para CUALQUIERA de los 12 proyectos parametrizando por CLI.
 *
 * SEGURIDAD (LEER ANTES DE CORRER)
 *   - Por DEFECTO el script es DRY-RUN: parsea el Excel, reporta counts y filas
 *     problemáticas, pero NO escribe NADA a la base de datos.
 *   - Para escribir de verdad hay que pasar el flag explícito `--confirm`.
 *
 * USO
 *   # 1) Dry-run (recomendado primero) — NO escribe, solo reporta:
 *   tsx src/scripts/migrate-project.ts \
 *       --excel "/ruta/SISTEMA BETANIA.xlsx" --project "Betania" --prefix J
 *
 *   # 2) Migración real (escribe a DB; crea el proyecto si no existe):
 *   tsx src/scripts/migrate-project.ts \
 *       --excel "/ruta/SISTEMA BETANIA.xlsx" --project "Betania" --prefix J --confirm
 *
 *   # Compatibilidad hacia atrás (proyecto ya existente por UUID):
 *   tsx src/scripts/migrate-project.ts --projectId <uuid> --excelPath <ruta> --confirm
 *
 * FLAGS
 *   --excel <ruta>     Ruta al .xlsx                       (alias: --excelPath)
 *   --project <nombre> Nombre del proyecto                 (ej. "Betania")
 *   --prefix <letra>   Prefijo de código del proyecto      (ej. J). Si se omite,
 *                      se infiere del código más frecuente en el Excel.
 *   --code <code>      Código corto del proyecto en DB     (default: derivado)
 *   --projectId <uuid> Usar un proyecto existente por UUID (omite --project)
 *   --confirm          ESCRIBE a la DB (sin él = dry-run, sin tocar la DB)
 *   --paymentsOnly     Solo inserta pagos en contratos existentes (requiere DB)
 *
 * Requiere: npm install xlsx
 */

import { PrismaClient, CuotaStatus, PaymentType, PaymentMethod, ContractStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { parsePlazo, buildScheduleAmounts } from './lib/installments';

const prisma = new PrismaClient();

// ============================================================================
// CONSTANTES
// ============================================================================

const PROJECT_PREFIXES: Record<string, string> = {
  'I': 'Magnolia del Sur',
  'V': 'Valle del Roble',
  'K': 'Monarca II',
  'E': 'Valle Bugambilias',
  'A': 'JSA 2',
  'B': 'JSA 3',
  'C': 'JSA 1',
  'D': 'JSA 4',
  'S': 'Santander',
  'P': 'Puerta del Sol',
};

const SPANISH_MONTHS: Record<string, number> = {
  'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
  'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
  'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11,
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// ============================================================================
// TIPOS
// ============================================================================

interface SheetRow {
  codigo: string;           // I008, V245, K032
  nombreCompleto: string;
  email?: string;
  telefono?: string;
  manzana: number;
  lote: number;
  lotes: string[];          // lotes vendidos derivados del campo LOTE ("10 y 11" → ["10","11"])
  precioTotal: number;
  enganche: number;
  plazoMeses: number;
  plazoSource: 'codigos' | 'inferido' | 'contado';
  isContado: boolean;       // venta de contado: sin cuotas
  status: 'ACTIVE' | 'CANCELED';
  cancelReason?: string;    // nota de rescisión/cancelación detectada
  fechaInicio: string;
  mensualidad: number;
  pagos: SheetPago[];
}

interface SheetPago {
  fecha: string;
  monto: number;
  concepto: string;
  tipo: 'enganche' | 'mensualidad' | 'otro';
}

// Filas crudas de cada hoja
interface FilaCodigos {
  codigo: string;
  nombre: string;
  manzana: number;
  loteRaw: string;     // texto crudo del campo LOTE ("10 y 11", "21-22-23-24")
  lote: number;        // primer lote numérico (compat)
  plazoRaw: string;    // texto crudo de PLAZO (AÑOS): "6", "DE CONTADO", "4a-2m", ""
  notas: string;       // texto extra de la fila (notas de rescisión/cancelación)
  fechaVenta: string;
  telefono: string;
}

interface FilaDirectorio {
  codigo: string;
  nombre: string;
  email: string;
  deudaTotal: number;   // lo que aún debe
  pagado: number;       // lo que ya pagó
  balance: number;
  telefono: string;
}

interface FilaIngreso {
  codigo: string;
  fecha: string;
  tipo: string;         // "Enganche", "Mensualidad", etc.
  concepto: string;
  monto: number;
}

interface MigrationResult {
  clientsCreated: number;
  clientsReused: number;
  contractsCreated: number;
  contractsCanceled: number;
  paymentsCreated: number;
  cuotasCreated: number;
  lotsSold: number;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
}

// ============================================================================
// MIGRATION LOGGER (del skill)
// ============================================================================

class MigrationLogger {
  private result: MigrationResult = {
    clientsCreated: 0,
    clientsReused: 0,
    contractsCreated: 0,
    contractsCanceled: 0,
    paymentsCreated: 0,
    cuotasCreated: 0,
    lotsSold: 0,
    errors: [],
    warnings: [],
  };

  private logFile: fs.WriteStream;

  constructor(projectCode: string, dryRun: boolean) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = dryRun ? '_dryrun' : '';
    const logPath = path.join(process.cwd(), 'logs', `migration_${projectCode}${suffix}_${timestamp}.log`);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    this.logFile = fs.createWriteStream(logPath, { flags: 'a' });
    this.write(`[START] Migration ${dryRun ? '(DRY-RUN)' : '(WRITE)'} started for project: ${projectCode}`);
  }

  private write(msg: string) {
    const line = `${new Date().toISOString()} ${msg}`;
    console.log(line);
    this.logFile.write(line + '\n');
  }

  logError(row: number, message: string) {
    this.result.errors.push({ row, message });
    this.write(`[ERROR] Row ${row}: ${message}`);
  }

  logWarning(row: number, message: string) {
    this.result.warnings.push({ row, message });
    this.write(`[WARN]  Row ${row}: ${message}`);
  }

  logSuccess(type: keyof Omit<MigrationResult, 'errors' | 'warnings'>) {
    (this.result[type] as number)++;
  }

  info(msg: string) {
    this.write(`[INFO]  ${msg}`);
  }

  getSummary(): string {
    return `
Migration Summary:
==================
Clients created   : ${this.result.clientsCreated}
Clients reused    : ${this.result.clientsReused}
Contracts ACTIVE  : ${this.result.contractsCreated}
Contracts CANCELED: ${this.result.contractsCanceled}
Payments          : ${this.result.paymentsCreated}
Cuotas            : ${this.result.cuotasCreated}
Lotes vendidos    : ${this.result.lotsSold}
Errors            : ${this.result.errors.length}
Warnings          : ${this.result.warnings.length}
    `.trim();
  }

  getResult(): MigrationResult {
    return this.result;
  }

  close() {
    this.write('[END] Migration finished');
    this.logFile.end();
  }
}

// ============================================================================
// HELPERS: FECHAS Y NOMBRES
// ============================================================================

function parseSpanishDate(dateStr: string): Date {
  const str = dateStr.trim();

  // Formatos con barra: M/D/YYYY HH:MM:SS (XLSX raw:false, en-US) o DD/MM/YYYY (entrada manual española)
  const slashDate = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashDate) {
    const [, a, b, y] = slashDate;
    const aNum = parseInt(a), bNum = parseInt(b), yNum = parseInt(y);
    const hasTime = /\s+\d{1,2}:\d{2}/.test(str);
    let month: number, day: number;

    if (hasTime) {
      // XLSX raw:false siempre genera M/D/YYYY HH:MM:SS (locale en-US)
      month = aNum; day = bNum;
    } else if (aNum > 12) {
      // Primer número > 12 → imposible que sea mes → DD/MM/YYYY español
      day = aNum; month = bNum;
    } else if (bNum > 12) {
      // Segundo número > 12 → imposible que sea mes → M/DD/YYYY
      month = aNum; day = bNum;
    } else {
      // Ambos ≤ 12 y sin hora → entrada manual española, asumir DD/MM/YYYY
      day = aNum; month = bNum;
    }

    return new Date(yNum, month - 1, day);
  }

  // Intenta parse estándar (ISO, etc.)
  const standard = new Date(str);
  if (!isNaN(standard.getTime())) return standard;

  // Formato "3 julio 2025" / "03 julio 2025"
  const parts = str.toLowerCase().split(/\s+/);
  for (const [monthName, monthNum] of Object.entries(SPANISH_MONTHS)) {
    if (parts.includes(monthName)) {
      const day = parseInt(parts[0]);
      const year = parseInt(parts[2]);
      if (!isNaN(day) && !isNaN(year)) {
        return new Date(year, monthNum, day);
      }
    }
  }

  throw new Error(`No se pudo parsear la fecha: "${dateStr}"`);
}

function formatSpanishMonth(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function generateContractNumber(codigoLegado: string, projectCode: string): string {
  return `${projectCode}-${codigoLegado}-${Date.now()}`;
}

// ============================================================================
// EXCEL: LEER 3 HOJAS Y CRUZAR DATOS
// ============================================================================

// Aliases para la hoja de Códigos según el formato del archivo
const CODIGOS_SHEET_ALIASES = ['Códigos', 'Códigos de Cliente', 'Códigos de Clientes', 'Codigo de Cliente', 'Codigos de Cliente'];

// Hojas no-pago en archivos JSA (todo lo demás se trata como hoja de pagos)
const JSA_NON_PAYMENT_SHEETS = new Set([
  'codigos de cliente', 'directorio', 'directorio.d', 'capturas', 'concentrado ', 'concentrado',
  'layout', 'config', 'bitacora', 'nvscriptsproperties', 'do not delete - autocrat job se',
  'clientes con contrato mal', 'retenidos campana', 'presidencia', 'presidencia pagos',
  'prospectación', 'prospectacion', 'mapa', 'hoja cobranza ', 'hoja cobranza',
  'lineamientos generales', 'ref1', 'ref2', 'cc1', 'cc2', 'r.cortes', 'r.propiedad',
  'r.cliente', 'r.aportes1', 'r.aportes2', 'r2', 'reporte.1', 'retencion campana', 'hoja 22',
]);

// Detecta en qué fila (0-based) están los headers buscando "CODIGO" o "NOMBRE"
function detectHeaderRow(ws: XLSX.WorkSheet): number {
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  for (let i = 0; i <= 4; i++) {
    const row = (raw[i] || []).join(' ').toUpperCase();
    if (row.includes('CODIGO') || row.includes('NOMBRE') || row.includes('CÓDIGO')) return i;
  }
  return 1;
}

// Lee una hoja con header en una fila específica (0-based)
function readSheet(wb: XLSX.WorkBook, sheetName: string, headerRow: number): Record<string, string>[] {
  // Búsqueda flexible del nombre de hoja (trim, case-insensitive)
  const found = wb.SheetNames.find(
    s => s.trim().toLowerCase() === sheetName.trim().toLowerCase()
  );
  if (!found) throw new Error(`Hoja "${sheetName}" no encontrada. Hojas disponibles: ${wb.SheetNames.join(', ')}`);

  const ws = wb.Sheets[found];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

  if (raw.length <= headerRow) return [];

  // De-duplicar headers: segundo "NOMBRE DE CLIENTE" → "NOMBRE DE CLIENTE__2"
  const seenH = new Map<string, number>();
  const headers: string[] = raw[headerRow].map((h: any) => {
    const key = h?.toString().trim() || '';
    if (!key) return '';
    const count = seenH.get(key) || 0;
    seenH.set(key, count + 1);
    return count === 0 ? key : `${key}__${count + 1}`;
  });

  const result: Record<string, string>[] = [];

  for (let i = headerRow + 1; i < raw.length; i++) {
    const rowArr = raw[i];
    // Omite filas completamente vacías
    if (!rowArr || rowArr.every((c: any) => !c?.toString().trim())) continue;

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const val = rowArr[idx]?.toString().trim() ?? '';
      if (h) obj[h] = val;
      // Siempre guarda alias posicional __col0, __col1, ...
      obj[`__col${idx}`] = val;
    });
    result.push(obj);
  }

  return result;
}

// Busca un campo en un objeto de forma flexible (case-insensitive, múltiples alias)
function getField(obj: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const direct = obj[key];
    if (direct) return direct;
    const found = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    if (found && obj[found]) return obj[found];
  }
  return '';
}

// Limpia montos con formato "$125,000.00" → 125000
function parseMoney(val: string): number {
  return parseFloat(val.replace(/[$,\s]/g, '')) || 0;
}

const PLAZO_FALLBACK = 60;
const PLAZO_OPCIONES = [60, 72, 84];

// Fila semilla / dummy: código terminado en "000" (X000) o nombre "Primera Fila"
function isDummyRow(codigo: string, nombre = ''): boolean {
  return /0{3}$/.test(codigo.trim()) || /primera\s*fila/i.test(nombre);
}

// Detecta notas de rescisión/cancelación de contrato (Magnolia, etc.)
function detectCancellation(...textos: string[]): string | null {
  const blob = textos.join(' ');
  if (/RESCIS|CANCELAC|DEVOLUC|CANCELAD/i.test(blob)) {
    return blob.replace(/\s+/g, ' ').trim().slice(0, 200);
  }
  return null;
}

// Extrae los lotes vendidos de un campo LOTE crudo:
//   "5"           → ["5"]
//   "10 y 11"     → ["10","11"]
//   "4,5,6,7"     → ["4","5","6","7"]
//   "21-22-23-24" → ["21","22","23","24"]
//   "1 y M7 L3"   → ["1","3"]  (best-effort)
// Sirve solo para derivar/contar lotes vendidos; el inventario completo vendrá
// de los planos en otra tarea.
function parseLotTokens(loteRaw: string): string[] {
  const s = (loteRaw || '').trim();
  if (!s) return [];
  // Rango con guiones "21-24": expandir si ambos extremos son numéricos contiguos
  const tokens = s
    .split(/\s*(?:,|y|-)\s*/i)
    .map((t) => {
      const m = t.match(/\d+/);   // toma el primer número del token ("L3" → "3")
      return m ? m[0] : '';
    })
    .filter(Boolean);
  // De-dup preservando orden
  return [...new Set(tokens)];
}

// Recolecta pagos de todas las hojas de fecha en archivos JSA (sin hoja "Ingresos")
function collectJSAPayments(wb: XLSX.WorkBook): Map<string, FilaIngreso[]> {
  const ingresosMap = new Map<string, FilaIngreso[]>();

  for (const sheetName of wb.SheetNames) {
    const lower = sheetName.toLowerCase().trim();
    if (JSA_NON_PAYMENT_SHEETS.has(lower)) continue;
    // Hojas "FASTIDIO …" (JSA 4) NO son de pagos: listan cada contrato con su
    // valor total y un timestamp. Su layout (código=col1, timestamp=col3,
    // $precioTotal=col4) hacía que el parser inyectara un EXTRA_PAYMENT igual
    // al precio total. Los nombres varían ("FASTIDIO JULI0 2024", "FASTIDIO 12
    // Oct 2024"), así que excluimos por prefijo.
    if (lower.startsWith('fastidio')) continue;

    const ws = wb.Sheets[sheetName];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

    for (const row of raw) {
      if (!row || row.length < 3) continue;

      // col1 debe ser un código tipo C001, A005, etc.
      const codigo = row[1]?.toString().trim().toUpperCase();
      if (!codigo || !/^[A-Z]\d+$/.test(codigo)) continue;
      if (isDummyRow(codigo)) continue;

      const fecha = row[0]?.toString().trim() || '';
      const tipo = row[2]?.toString().trim() || '';
      const concepto = row[3]?.toString().trim() || '';

      // El monto puede estar en cualquier col ≥2 que empiece con "$"
      let monto = 0;
      for (let c = 2; c < row.length; c++) {
        const val = row[c]?.toString().trim() || '';
        if (val.startsWith('$')) { monto = parseMoney(val); break; }
      }
      if (monto <= 0) continue;

      const ingreso: FilaIngreso = { codigo, fecha, tipo, concepto, monto };
      if (!ingresosMap.has(codigo)) ingresosMap.set(codigo, []);
      ingresosMap.get(codigo)!.push(ingreso);
    }
  }

  return ingresosMap;
}

function readExcelFile(excelPath: string): SheetRow[] {
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Archivo Excel no encontrado: ${excelPath}`);
  }

  const wb = XLSX.readFile(excelPath);

  // ── Hoja "Códigos" (o variante): detección automática de nombre y headerRow ──
  const codigosSheetFound = wb.SheetNames.find(s =>
    CODIGOS_SHEET_ALIASES.some(alias => alias.trim().toLowerCase() === s.trim().toLowerCase())
  );
  if (!codigosSheetFound) {
    throw new Error(`No se encontró hoja de Códigos. Hojas disponibles: ${wb.SheetNames.join(', ')}`);
  }
  const codigosHeaderRow = detectHeaderRow(wb.Sheets[codigosSheetFound]);
  const filasCodigoRaw = readSheet(wb, codigosSheetFound, codigosHeaderRow);
  const filaCodigos: FilaCodigos[] = filasCodigoRaw
    .map(r => {
      // notas = todas las columnas posicionales unidas (para detectar rescisión/cancelación)
      const notas = Object.keys(r)
        .filter(k => k.startsWith('__col'))
        .map(k => r[k])
        .join(' ');
      const loteRaw = getField(r, 'LOTE', 'LOTE ');
      return {
        codigo:     getField(r, 'CODIGO DE CLIENTE ASIGNADO', 'CODIGO DE CLIENTE ASIGNADO (K)', 'CODIGO DE CLIENTE', 'Código', 'codigo').toUpperCase(),
        nombre:     getField(r, 'NOMBRE  DE CLIENTE', 'NOMBRE DE CLIENTE', 'Nombre', 'nombre'),
        manzana:    parseInt(getField(r, 'MANZANA', 'MANZANA ', 'FRACCION', 'FRACCION ', 'FRACCIÓN', '__col2')) || 0,
        loteRaw,
        lote:       parseInt(loteRaw) || 0,
        plazoRaw:   getField(r, 'PLAZO (AÑOS)', 'PLAZO (AÑOS) ', 'PLAZO (AÑOS)__2', 'PLAZO', 'Plazo'),
        notas,
        fechaVenta: getField(r, 'FECHA DE VENTA', 'Fecha de venta'),
        telefono:   getField(r, 'NUMERO DE TELEFONO', 'Teléfono', 'Telefono'),
      };
    })
    // Solo filas con un código de venta válido (letra + dígitos). Descarta los
    // renglones de estadísticas laterales ("TOTAL VENDIDOS", "Libres", etc.)
    .filter(r => r.codigo && r.nombre && /^[A-Z]+\d+$/.test(r.codigo))
    // Descarta la fila semilla "Primera Fila" / código X000
    .filter(r => !isDummyRow(r.codigo, r.nombre));

  // ── Hoja "Directorio": headers en fila 2 (índice 1) ──
  const filasDirectorioRaw = readSheet(wb, 'Directorio', 1);
  const directorioMap = new Map<string, FilaDirectorio>();
  for (const r of filasDirectorioRaw) {
    const codigo = getField(r, 'Código', 'Codigo', 'código').toUpperCase();
    if (!codigo) continue;
    const nombreDir = getField(r, 'Nombre del Cliente', 'Nombre');
    if (isDummyRow(codigo, nombreDir)) continue;   // descarta fila semilla X000 / Primera Fila
    directorioMap.set(codigo, {
      codigo,
      nombre:     getField(r, 'Nombre del Cliente', 'Nombre'),
      email:      getField(r, 'Correo', 'Email', 'email'),
      deudaTotal: parseMoney(getField(r, 'Deuda Total', 'Deuda')),
      pagado:     parseMoney(getField(r, 'Pagado')),
      balance:    parseMoney(getField(r, 'Balance')),
      telefono:   getField(r, 'Teléfono', 'Telefono', 'NUMERO DE TELEFONO'),
    });
  }

  // ── Hoja "Ingresos" (o colección JSA de hojas de fecha) ──
  const ingresosSheetFound = wb.SheetNames.find(
    s => s.trim().toLowerCase() === 'ingresos'
  );
  const ingresosMap = new Map<string, FilaIngreso[]>();

  if (ingresosSheetFound) {
    // Formato A/B: hoja única "Ingresos"
    const filasIngresosRaw = readSheet(wb, ingresosSheetFound, 1);
    for (const r of filasIngresosRaw) {
      // "Código del Cliente" (con "del") es la variante de Valle del Roble
      const codigo = getField(r, 'Código de Cliente', 'Código del Cliente', 'Codigo de Cliente', 'Codigo del Cliente', 'Código').toUpperCase();
      if (!codigo) continue;
      if (isDummyRow(codigo, getField(r, 'Nombre del Cliente', 'Nombre de Cliente'))) continue;

      const monto = parseMoney(getField(r, 'Monto'));
      if (monto <= 0) continue;

      const ingreso: FilaIngreso = {
        codigo,
        fecha:    getField(r, 'Marca temporal', 'Fecha'),
        tipo:     getField(r, 'Tipo de Ingreso', 'Tipo'),
        concepto: getField(r, 'Concepto'),
        monto,
      };

      if (!ingresosMap.has(codigo)) ingresosMap.set(codigo, []);
      ingresosMap.get(codigo)!.push(ingreso);
    }
  } else {
    // Formato C (JSA): recolectar de todas las hojas de fecha
    const jsaMap = collectJSAPayments(wb);
    for (const [k, v] of jsaMap) ingresosMap.set(k, v);
  }

  // ── DEDUPE de pagos: elimina filas EXACTAMENTE idénticas ──
  // Clave = codigo|fecha|tipo|concepto|monto. NO se deduplica por
  // (codigo,concepto,monto) porque en este template las mensualidades del mismo
  // lote tienen idéntico concepto+monto y solo cambian de fecha → deduplicar así
  // colapsaría pagos legítimos (p.ej. ~58 mensualidades en Magnolia).
  for (const [cod, pagos] of ingresosMap) {
    const seen = new Set<string>();
    const unique: FilaIngreso[] = [];
    for (const p of pagos) {
      const key = `${p.fecha}|${p.tipo}|${p.concepto}|${p.monto}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(p);
    }
    ingresosMap.set(cod, unique);
  }

  // ── CRUZAR: construir SheetRow por cliente ──

  const rows: SheetRow[] = [];

  for (const cod of filaCodigos) {
    const dir  = directorioMap.get(cod.codigo.toUpperCase());
    const pagos = ingresosMap.get(cod.codigo.toUpperCase()) ?? [];

    // precio_total = deuda_total + pagado (recalculado, no el balance del sheet)
    const pagadoTotal  = pagos.reduce((s, p) => s + p.monto, 0);
    const deudaTotal   = dir?.deudaTotal ?? 0;
    const precioTotal  = deudaTotal > 0
      ? deudaTotal
      : pagadoTotal;   // fallback si Directorio está vacío

    // enganche = suma de pagos tipo "Enganche"
    const enganche = pagos
      .filter(p => p.tipo.toLowerCase().includes('enganche'))
      .reduce((s, p) => s + p.monto, 0);

    // ── PLAZO primero (autoritativo desde Códigos) ──
    const plazoCodigos = parsePlazo(cod.plazoRaw);
    const financiado   = precioTotal - enganche;
    let plazoMeses: number;
    let plazoSource: SheetRow['plazoSource'];
    const isContado = plazoCodigos.isContado;
    if (plazoCodigos.isContado) {
      plazoMeses  = 0;
      plazoSource = 'contado';
    } else if (plazoCodigos.months != null) {
      plazoMeses  = plazoCodigos.months;
      plazoSource = 'codigos';
    } else {
      plazoMeses  = PLAZO_FALLBACK;      // sin PLAZO en Códigos → fallback (se reporta en revisión humana)
      plazoSource = 'inferido';
    }

    // ── MENSUALIDAD derivada: financiado / plazo (la última cuota absorbe redondeo) ──
    const mensualidad = plazoMeses > 0 ? buildScheduleAmounts(financiado, plazoMeses)[0] : 0;

    // ── CANCELACIÓN: detectar notas de rescisión/cancelación ──
    const cancelReason = detectCancellation(cod.notas);
    const status: SheetRow['status'] = cancelReason ? 'CANCELED' : 'ACTIVE';

    // ── LOTES vendidos derivados del campo LOTE ──
    const lotes = parseLotTokens(cod.loteRaw);

    rows.push({
      codigo:         cod.codigo,
      nombreCompleto: dir?.nombre || cod.nombre,
      email:          dir?.email  || undefined,
      telefono:       dir?.telefono || cod.telefono || undefined,
      manzana:        cod.manzana,
      lote:           cod.lote,
      lotes,
      precioTotal,
      enganche,
      plazoMeses,
      plazoSource,
      isContado,
      status,
      cancelReason: cancelReason ?? undefined,
      fechaInicio:    cod.fechaVenta || new Date().toISOString(),
      mensualidad,
      pagos: pagos.map(p => ({
        fecha:    p.fecha,
        monto:    p.monto,
        concepto: p.concepto,
        tipo:     p.tipo.toLowerCase().includes('enganche')   ? 'enganche'
                : p.tipo.toLowerCase().includes('mensualidad') ? 'mensualidad'
                : 'otro',
      })),
    });
  }

  return rows;
}

// ============================================================================
// CLIENT: FIND OR CREATE (del skill)
// ============================================================================

async function findOrCreateClient(
  data: { nombre: string; email?: string; telefono?: string },
  logger: MigrationLogger,
  rowIdx: number
): Promise<string> {
  const nombreNorm = normalizeName(data.nombre);

  const existing = await prisma.client.findFirst({
    where: { firstName: { contains: nombreNorm.split(' ')[0], mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });

  // Verificar match completo por nombre normalizado
  if (existing) {
    const existingNorm = normalizeName(`${existing.firstName} ${existing.lastName}`);
    if (existingNorm === nombreNorm) {
      // Actualizar email/teléfono si faltan
      const updates: any = {};
      if (!existing.email && data.email) updates.email = data.email;
      if (!existing.phone && data.telefono) updates.phone = data.telefono;

      if (Object.keys(updates).length > 0) {
        await prisma.client.update({ where: { id: existing.id }, data: updates });
        logger.logWarning(rowIdx, `Cliente "${data.nombre}" ya existe — datos complementados`);
      }

      logger.logSuccess('clientsReused');
      return existing.id;
    }
  }

  // Crear nuevo cliente
  const count = await prisma.client.count();
  const globalCode = `CLI-${String(count + 1).padStart(4, '0')}`;

  const nameParts = data.nombre.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || '-';

  const client = await prisma.client.create({
    data: {
      globalCode,
      firstName,
      lastName,
      email: data.email,
      phone: data.telefono || 'Sin teléfono',
      status: 'ACTIVE',
    },
  });

  logger.logSuccess('clientsCreated');
  return client.id;
}

// ============================================================================
// CUOTAS: GENERAR CALENDARIO
// ============================================================================

async function generarCuotas(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  contractId: string,
  financiado: number,
  plazoMeses: number,
  fechaInicio: Date,
  logger: MigrationLogger,
  rowIdx: number
): Promise<number> {
  const amounts = buildScheduleAmounts(financiado, plazoMeses);
  const cuotasData = amounts.map((monto, i) => {
    const fechaVencimiento = new Date(fechaInicio);
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + i + 1);
    return {
      contractId,
      numeroCuota: i + 1,
      mes: formatSpanishMonth(fechaVencimiento),
      montoEsperado: monto,
      montoPagado: 0,
      fechaVencimiento,
      status: CuotaStatus.PENDIENTE,
    };
  });
  await tx.cuota.createMany({ data: cuotasData });
  logger.info(`  → ${cuotasData.length} cuotas generadas para contrato ${contractId}`);
  return cuotasData.length;
}

// ============================================================================
// BALANCE: RECALCULAR DESDE PAGOS (del skill — nunca confiar en Sheets)
// ============================================================================

async function recalcularBalance(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  contractId: string
): Promise<number> {
  const result = await tx.payment.aggregate({
    where: { contractId },
    _sum: { amount: true },
  });

  const totalPagado = result._sum.amount || 0;
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    select: { totalPrice: true },
  });

  if (!contract) throw new Error(`Contrato ${contractId} no encontrado al recalcular balance`);

  const saldoPendiente = contract.totalPrice - totalPagado;

  await tx.contract.update({
    where: { id: contractId },
    data: { balance: saldoPendiente },
  });

  return saldoPendiente;
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

export async function migrateProject(projectId: string, excelPath: string, paymentsOnly = false): Promise<MigrationResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Proyecto no encontrado: ${projectId}`);

  const logger = new MigrationLogger(project.code, false);
  logger.info(`Proyecto: ${project.name} (${project.code})`);
  logger.info(`Excel: ${path.resolve(excelPath)}`);

  try {
    // EXTRACT: leer Excel local
    logger.info('Leyendo archivo Excel...');
    const rows = readExcelFile(excelPath);
    logger.info(`Filas a procesar: ${rows.length}`);

    // TRANSFORM + LOAD: procesar fila por fila
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      logger.info(`Procesando fila ${idx + 1}/${rows.length}: ${row.codigo} - ${row.nombreCompleto}`);

      try {
        // Validaciones básicas
        if (!row.codigo) {
          logger.logError(idx + 1, 'Falta codigo_legado');
          continue;
        }
        if (!row.nombreCompleto) {
          logger.logError(idx + 1, 'Falta nombre del cliente');
          continue;
        }
        if (row.precioTotal <= 0) {
          logger.logError(idx + 1, `precio_total inválido: ${row.precioTotal}`);
          continue;
        }
        if (row.enganche > row.precioTotal) {
          logger.logWarning(idx + 1, `enganche (${row.enganche}) > precio_total (${row.precioTotal})`);
        }
        if (row.manzana <= 0 || row.lote <= 0) {
          logger.logError(idx + 1, `manzana/lote inválidos: ${row.manzana}/${row.lote}`);
          continue;
        }

        // Verificar si el contrato ya fue migrado (idempotencia)
        const existingContract = await prisma.contract.findFirst({
          where: { codigoLegado: row.codigo },
        });

        if (paymentsOnly) {
          // Modo pagos-only: solo insertar pagos para contratos existentes
          if (!existingContract) {
            logger.logWarning(idx + 1, `Contrato ${row.codigo} no existe — omitido en modo paymentsOnly`);
            continue;
          }
          if (row.pagos.length === 0) {
            logger.logWarning(idx + 1, `Contrato ${row.codigo} no tiene pagos en Excel — omitido`);
            continue;
          }

          const fechaInicio = (() => {
            try { return parseSpanishDate(row.fechaInicio); } catch { return new Date(); }
          })();

          await prisma.$transaction(async (tx) => {
            for (const pago of row.pagos) {
              let paymentType: PaymentType;
              if (pago.tipo === 'enganche')        paymentType = PaymentType.DOWN_PAYMENT;
              else if (pago.tipo === 'mensualidad') paymentType = PaymentType.INSTALLMENT;
              else                                  paymentType = PaymentType.EXTRA_PAYMENT;

              let fechaPago: Date;
              try {
                fechaPago = parseSpanishDate(pago.fecha);
              } catch {
                logger.logWarning(idx + 1, `Fecha inválida en pago: "${pago.fecha}" — usando fecha de contrato`);
                fechaPago = fechaInicio;
              }

              const paymentCount = await tx.payment.count();
              await tx.payment.create({
                data: {
                  paymentNumber: `${project.code}-PAY-${String(paymentCount + 1).padStart(6, '0')}`,
                  contractId: existingContract.id,
                  clientId:   existingContract.clientId,
                  paymentType,
                  paymentMethod: PaymentMethod.TRANSFER,
                  amount: pago.monto,
                  paymentDate: fechaPago,
                  concept: pago.concepto || `Manzana ${row.manzana} Lote ${row.lote}`,
                  status: 'CONFIRMED',
                },
              });
              logger.logSuccess('paymentsCreated');
            }

            const saldo = await recalcularBalance(tx, existingContract.id);
            logger.info(`  → ${row.pagos.length} pagos insertados | Balance: $${saldo.toLocaleString('es-MX')} MXN`);
          }, { timeout: 60000 });

          continue;
        }

        if (existingContract) {
          logger.logWarning(idx + 1, `Contrato ${row.codigo} ya existe — omitido`);
          continue;
        }

        // Procesar en transacción
        await prisma.$transaction(async (tx) => {
          // 1. Cliente (find or create)
          const clientId = await findOrCreateClient(
            { nombre: row.nombreCompleto, email: row.email, telefono: row.telefono },
            logger,
            idx + 1
          );

          // 2. Contrato
          const fechaInicio = parseSpanishDate(row.fechaInicio);
          const financingAmount = row.precioTotal - row.enganche;

          const contractStatus = row.status === 'CANCELED'
            ? ContractStatus.CANCELED
            : ContractStatus.ACTIVE;

          const contract = await tx.contract.create({
            data: {
              contractNumber: generateContractNumber(row.codigo, project.code),
              codigoLegado: row.codigo,
              clientId,
              projectId,
              contractDate: fechaInicio,
              status: contractStatus,
              totalPrice: row.precioTotal,
              downPayment: row.enganche,
              financingAmount,
              balance: financingAmount,
              paymentPlanType: row.isContado ? 'CASH' : 'INSTALLMENTS',
              installmentCount: row.isContado ? 1 : row.plazoMeses,
              installmentAmount: row.isContado ? row.precioTotal : row.mensualidad,
              startDate: fechaInicio,
              notes: row.cancelReason ? `[MIGRACIÓN] ${row.cancelReason}` : undefined,
            },
          });

          if (row.status === 'CANCELED') logger.logSuccess('contractsCanceled');
          else                           logger.logSuccess('contractsCreated');
          logger.info(`  → Contrato creado (${contractStatus}): ${contract.contractNumber}`);

          // 3. Registrar todos los pagos históricos desde "Ingresos"
          for (const pago of row.pagos) {
            let paymentType: PaymentType;
            if (pago.tipo === 'enganche') {
              paymentType = PaymentType.DOWN_PAYMENT;
            } else if (pago.tipo === 'mensualidad') {
              paymentType = PaymentType.INSTALLMENT;
            } else {
              paymentType = PaymentType.EXTRA_PAYMENT;
            }

            let fechaPago: Date;
            try {
              fechaPago = parseSpanishDate(pago.fecha);
            } catch {
              logger.logWarning(idx + 1, `Fecha inválida en pago: "${pago.fecha}" — usando fecha de contrato`);
              fechaPago = fechaInicio;
            }

            const paymentCount = await tx.payment.count();
            await tx.payment.create({
              data: {
                paymentNumber: `${project.code}-PAY-${String(paymentCount + 1).padStart(6, '0')}`,
                contractId: contract.id,
                clientId,
                paymentType,
                paymentMethod: PaymentMethod.TRANSFER,
                amount: pago.monto,
                paymentDate: fechaPago,
                concept: pago.concepto || `Manzana ${row.manzana} Lote ${row.lote}`,
                status: 'CONFIRMED',
              },
            });
            logger.logSuccess('paymentsCreated');
          }

          // 5. Generar cuotas — NO para contratos de contado ni cancelados
          if (row.isContado) {
            logger.info('  → Venta de CONTADO: sin calendario de cuotas');
          } else if (row.status === 'CANCELED') {
            logger.info('  → Contrato CANCELADO: sin calendario de cuotas');
          } else {
            const cuotasCount = await generarCuotas(
              tx,
              contract.id,
              row.precioTotal - row.enganche,
              row.plazoMeses,
              fechaInicio,
              logger,
              idx + 1
            );
            for (let c = 0; c < cuotasCount; c++) logger.logSuccess('cuotasCreated');
          }

          // 6. Recalcular balance desde pagos reales (no confiar en Sheets)
          const saldo = await recalcularBalance(tx, contract.id);
          logger.info(`  → Balance recalculado: $${saldo.toLocaleString('es-MX')} MXN`);

        }, { timeout: 60000 });

      } catch (rowError) {
        logger.logError(idx + 1, (rowError as Error).message);
        // Continúa con la siguiente fila
      }
    }

  } catch (fatalError) {
    logger.logError(0, `Error fatal: ${(fatalError as Error).message}`);
    throw fatalError;
  } finally {
    console.log('\n' + logger.getSummary());
    logger.close();
    await prisma.$disconnect();
  }

  return logger.getResult();
}

// ============================================================================
// DRY-RUN: parsear y reportar SIN tocar la DB
// ============================================================================

// Aplica las mismas validaciones que el camino de escritura para clasificar
// una fila como migrable o problemática (para revisión humana).
function validateRow(row: SheetRow): string | null {
  if (!row.codigo) return 'Falta código';
  if (!row.nombreCompleto) return 'Falta nombre del cliente';
  if (row.precioTotal <= 0) return `precio_total inválido (${row.precioTotal}) — sin Deuda Total ni pagos`;
  if (row.manzana <= 0 || row.lote <= 0) return `manzana/lote inválidos (${row.manzana}/${row.lote})`;
  return null;
}

function runDryRun(excelPath: string, label: string): MigrationResult {
  const result: MigrationResult = {
    clientsCreated: 0, clientsReused: 0, contractsCreated: 0, contractsCanceled: 0,
    paymentsCreated: 0, cuotasCreated: 0, lotsSold: 0, errors: [], warnings: [],
  };

  const rows = readExcelFile(excelPath);
  const clientes = new Set<string>();
  const problemRows: Array<{ codigo: string; nombre: string; reason: string }> = [];
  const reviewRows: Array<{ codigo: string; nombre: string; note: string }> = [];

  rows.forEach((row, idx) => {
    const problem = validateRow(row);
    if (problem) {
      problemRows.push({ codigo: row.codigo, nombre: row.nombreCompleto, reason: problem });
      result.errors.push({ row: idx + 1, message: `${row.codigo}: ${problem}` });
      return;
    }

    clientes.add(normalizeName(row.nombreCompleto));
    if (row.status === 'CANCELED') result.contractsCanceled++;
    else                           result.contractsCreated++;

    result.paymentsCreated += row.pagos.length;
    result.lotsSold += row.lotes.length;

    if (row.status !== 'CANCELED' && !row.isContado) {
      result.cuotasCreated += row.plazoMeses;
    }

    // Fechas de pago no parseables → revisión
    for (const p of row.pagos) {
      try { parseSpanishDate(p.fecha); }
      catch { reviewRows.push({ codigo: row.codigo, nombre: row.nombreCompleto, note: `fecha de pago no parseable: "${p.fecha}"` }); }
    }
    if (row.isContado) {
      reviewRows.push({ codigo: row.codigo, nombre: row.nombreCompleto, note: `DE CONTADO — sin cuotas (1 exhibición)` });
    } else if (row.plazoSource === 'inferido') {
      reviewRows.push({ codigo: row.codigo, nombre: row.nombreCompleto, note: `plazo INFERIDO (${row.plazoMeses}m) — sin PLAZO en Códigos` });
    }
    if (row.status === 'CANCELED') {
      reviewRows.push({ codigo: row.codigo, nombre: row.nombreCompleto, note: `CANCELADO: ${row.cancelReason}` });
    }
  });

  result.clientsCreated = clientes.size;

  // ── Reporte ──
  console.log(`\n${'='.repeat(70)}`);
  console.log(`DRY-RUN — ${label}`);
  console.log(`Excel: ${path.resolve(excelPath)}`);
  console.log('='.repeat(70));
  console.log(`Filas (contratos en Códigos)   : ${rows.length}`);
  console.log(`Clientes únicos (a crear/reusar): ${result.clientsCreated}`);
  console.log(`Contratos ACTIVE migrables     : ${result.contractsCreated}`);
  console.log(`Contratos CANCELED             : ${result.contractsCanceled}`);
  console.log(`Pagos a insertar               : ${result.paymentsCreated}`);
  console.log(`Cuotas a generar               : ${result.cuotasCreated}`);
  console.log(`Lotes vendidos derivados       : ${result.lotsSold}`);
  console.log(`Filas problemáticas (excluidas): ${problemRows.length}`);
  console.log(`Filas para revisión humana     : ${reviewRows.length}`);

  if (problemRows.length) {
    console.log(`\n── FILAS PROBLEMÁTICAS (NO se migrarían) ──`);
    for (const p of problemRows) console.log(`  ✗ ${p.codigo} (${p.nombre}): ${p.reason}`);
  }
  if (reviewRows.length) {
    console.log(`\n── REVISIÓN HUMANA (se migrarían, pero conviene revisar) ──`);
    const shown = reviewRows.slice(0, 40);
    for (const r of shown) console.log(`  ⚠ ${r.codigo} (${r.nombre}): ${r.note}`);
    if (reviewRows.length > shown.length) console.log(`  … y ${reviewRows.length - shown.length} más`);
  }
  console.log('\n(DRY-RUN — no se escribió NADA a la base de datos. Usa --confirm para migrar.)\n');

  return result;
}

// ============================================================================
// PROYECTO: resolver o crear (solo en modo escritura)
// ============================================================================

function deriveProjectCode(name: string, _prefix?: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function resolveOrCreateProject(
  opts: { project?: string; code?: string; prefix?: string; rows: SheetRow[] }
): Promise<{ id: string; code: string; name: string }> {
  const code = opts.code || deriveProjectCode(opts.project || 'PROYECTO', opts.prefix);

  // Buscar por code o por nombre
  const existing = await prisma.project.findFirst({
    where: { OR: [{ code }, { name: opts.project || '___' }] },
  });
  if (existing) return existing;

  // Crear — totalLots = lotes vendidos derivados (placeholder; el inventario
  // completo se cargará desde planos en otra tarea).
  const totalLots = opts.rows.reduce((s, r) => s + r.lotes.length, 0);
  const created = await prisma.project.create({
    data: {
      code,
      name: opts.project || code,
      location: 'Por definir',
      city: 'Por definir',
      state: 'Por definir',
      totalLots,
      status: 'ACTIVE',
    },
  });
  console.log(`✓ Proyecto creado: ${created.name} (${created.code}) — totalLots=${totalLots}`);
  return created;
}

// ============================================================================
// ENTRY POINT (CLI)
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const excelPath    = getArg('--excel') || getArg('--excelPath');
  const projectName  = getArg('--project');
  const prefix       = getArg('--prefix');
  const code         = getArg('--code');
  const projectId    = getArg('--projectId');
  const confirm      = args.includes('--confirm');
  const paymentsOnly = args.includes('--paymentsOnly');

  if (!excelPath) {
    console.error('Falta --excel <ruta-al-xlsx>.');
    console.error('Uso (dry-run): tsx src/scripts/migrate-project.ts --excel "<ruta>" --project "<nombre>" --prefix <letra>');
    console.error('Uso (escribe): añade --confirm');
    process.exit(1);
  }

  // ── DRY-RUN (por defecto): NO toca la DB ──
  if (!confirm) {
    try {
      const label = projectName || projectId || path.basename(excelPath);
      const result = runDryRun(excelPath, label);
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      console.error('Dry-run falló:', err);
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  // ── MODO ESCRITURA (--confirm) ──
  try {
    let resolvedId = projectId;
    if (!resolvedId) {
      if (!projectName) {
        console.error('Para escribir necesitas --project <nombre> (o --projectId <uuid>).');
        process.exit(1);
      }
      const rows = readExcelFile(excelPath);
      const project = await resolveOrCreateProject({ project: projectName, code, prefix, rows });
      resolvedId = project.id;
    }

    const result = await migrateProject(resolvedId, excelPath, paymentsOnly);
    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (err) {
    console.error('Migration failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
