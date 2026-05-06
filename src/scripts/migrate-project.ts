/**
 * ETL: XLSX → PostgreSQL
 * Fase 2 - Migración de datos por proyecto
 *
 * Uso:
 *   npx tsx src/scripts/migrate-project.ts --projectId <uuid> --excelPath <ruta-al-archivo.xlsx>
 *
 * Requiere:
 *   npm install xlsx
 */

import { PrismaClient, CuotaStatus, PaymentType, PaymentMethod, ContractStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

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
  precioTotal: number;
  enganche: number;
  plazoMeses: number;
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
  lote: number;
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
  paymentsCreated: number;
  cuotasCreated: number;
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
    paymentsCreated: 0,
    cuotasCreated: 0,
    errors: [],
    warnings: [],
  };

  private logFile: fs.WriteStream;

  constructor(projectCode: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(process.cwd(), 'logs', `migration_${projectCode}_${timestamp}.log`);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    this.logFile = fs.createWriteStream(logPath, { flags: 'a' });
    this.write(`[START] Migration started for project: ${projectCode}`);
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
Clients created : ${this.result.clientsCreated}
Clients reused  : ${this.result.clientsReused}
Contracts       : ${this.result.contractsCreated}
Payments        : ${this.result.paymentsCreated}
Cuotas          : ${this.result.cuotasCreated}
Errors          : ${this.result.errors.length}
Warnings        : ${this.result.warnings.length}
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

// Recolecta pagos de todas las hojas de fecha en archivos JSA (sin hoja "Ingresos")
function collectJSAPayments(wb: XLSX.WorkBook): Map<string, FilaIngreso[]> {
  const ingresosMap = new Map<string, FilaIngreso[]>();

  for (const sheetName of wb.SheetNames) {
    const lower = sheetName.toLowerCase().trim();
    if (JSA_NON_PAYMENT_SHEETS.has(lower)) continue;

    const ws = wb.Sheets[sheetName];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

    for (const row of raw) {
      if (!row || row.length < 3) continue;

      // col1 debe ser un código tipo C001, A005, etc.
      const codigo = row[1]?.toString().trim().toUpperCase();
      if (!codigo || !/^[A-Z]\d+$/.test(codigo)) continue;

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
    .map(r => ({
      codigo:     getField(r, 'CODIGO DE CLIENTE ASIGNADO', 'CODIGO DE CLIENTE ASIGNADO (K)', 'CODIGO DE CLIENTE', 'Código', 'codigo'),
      nombre:     getField(r, 'NOMBRE  DE CLIENTE', 'NOMBRE DE CLIENTE', 'Nombre', 'nombre'),
      manzana:    parseInt(getField(r, 'MANZANA', 'MANZANA ', 'FRACCION', 'FRACCION ', 'FRACCIÓN', '__col2')) || 0,
      lote:       parseInt(getField(r, 'LOTE', 'LOTE ')) || 0,
      fechaVenta: getField(r, 'FECHA DE VENTA', 'Fecha de venta'),
      telefono:   getField(r, 'NUMERO DE TELEFONO', 'Teléfono', 'Telefono'),
    }))
    .filter(r => r.codigo && r.nombre);

  // ── Hoja "Directorio": headers en fila 2 (índice 1) ──
  const filasDirectorioRaw = readSheet(wb, 'Directorio', 1);
  const directorioMap = new Map<string, FilaDirectorio>();
  for (const r of filasDirectorioRaw) {
    const codigo = getField(r, 'Código', 'Codigo', 'código').toUpperCase();
    if (!codigo) continue;
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
      const codigo = getField(r, 'Código de Cliente', 'Codigo de Cliente', 'Código').toUpperCase();
      if (!codigo) continue;

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

  // ── CRUZAR: construir SheetRow por cliente ──
  const PLAZO_FALLBACK = 60;
  const PLAZO_OPCIONES = [60, 72, 84];

  // Devuelve el monto que más se repite entre los pagos de mensualidad
  function modaMensualidad(pagos: FilaIngreso[]): number {
    const montos = pagos
      .filter(p => p.tipo.toLowerCase().includes('mensualidad'))
      .map(p => Math.round(p.monto));
    if (!montos.length) return 0;
    const freq = new Map<number, number>();
    for (const m of montos) freq.set(m, (freq.get(m) || 0) + 1);
    return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  // Redondea al plazo más cercano entre las opciones dadas
  function inferirPlazo(financiado: number, mensualidad: number): number {
    if (!mensualidad) return PLAZO_FALLBACK;
    const calculado = financiado / mensualidad;
    return PLAZO_OPCIONES.reduce((best, p) =>
      Math.abs(p - calculado) < Math.abs(best - calculado) ? p : best
    );
  }

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

    // mensualidad = monto más frecuente en pagos tipo "Mensualidad"
    const mensualidad = modaMensualidad(pagos);

    // plazo = inferido desde (precioTotal - enganche) / mensualidad, o fallback 60
    const financiado  = precioTotal - enganche;
    const plazoMeses  = inferirPlazo(financiado, mensualidad);

    rows.push({
      codigo:         cod.codigo,
      nombreCompleto: dir?.nombre || cod.nombre,
      email:          dir?.email  || undefined,
      telefono:       dir?.telefono || cod.telefono || undefined,
      manzana:        cod.manzana,
      lote:           cod.lote,
      precioTotal,
      enganche,
      plazoMeses,
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
  mensualidad: number,
  plazoMeses: number,
  fechaInicio: Date,
  logger: MigrationLogger,
  rowIdx: number
): Promise<number> {
  const cuotasData = [];

  for (let i = 0; i < plazoMeses; i++) {
    const fechaVencimiento = new Date(fechaInicio);
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + i + 1);

    cuotasData.push({
      contractId,
      numeroCuota: i + 1,
      mes: formatSpanishMonth(fechaVencimiento),
      montoEsperado: mensualidad,
      montoPagado: 0,
      fechaVencimiento,
      status: CuotaStatus.PENDIENTE,
    });
  }

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

  const logger = new MigrationLogger(project.code);
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

          const contract = await tx.contract.create({
            data: {
              contractNumber: generateContractNumber(row.codigo, project.code),
              codigoLegado: row.codigo,
              clientId,
              projectId,
              contractDate: fechaInicio,
              status: ContractStatus.ACTIVE,
              totalPrice: row.precioTotal,
              downPayment: row.enganche,
              financingAmount,
              balance: financingAmount,
              installmentCount: row.plazoMeses,
              installmentAmount: row.mensualidad,
              startDate: fechaInicio,
            },
          });

          logger.logSuccess('contractsCreated');
          logger.info(`  → Contrato creado: ${contract.contractNumber}`);

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

          // 5. Generar cuotas
          const cuotasCount = await generarCuotas(
            tx,
            contract.id,
            row.mensualidad,
            row.plazoMeses,
            fechaInicio,
            logger,
            idx + 1
          );
          for (let c = 0; c < cuotasCount; c++) logger.logSuccess('cuotasCreated');

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
// ENTRY POINT (CLI)
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const projectId    = getArg('--projectId');
  const excelPath    = getArg('--excelPath');
  const paymentsOnly = args.includes('--paymentsOnly');

  if (!projectId || !excelPath) {
    console.error('Uso: npx tsx src/scripts/migrate-project.ts --projectId <uuid> --excelPath <ruta> [--paymentsOnly]');
    process.exit(1);
  }

  try {
    const result = await migrateProject(projectId, excelPath, paymentsOnly);
    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
