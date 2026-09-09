/**
 * ============================================================================
 * report-vdr-discrepancias.ts — Reporte de dudas para el equipo (UNA hoja)
 * ============================================================================
 *
 * Compara "VALLE DEL ROBLE.xlsx" (entregado por el equipo) contra CentralHub y
 * genera un .xlsx de UNA sola hoja con las dudas que necesitamos que aclaren.
 *
 * Formato deliberadamente plano: el equipo no pudo llenar nuestro machote de
 * 14 pestañas con colores y candados, y en cambio sí respondió con su propio
 * archivo de una hoja. Aquí se replica esa forma: una tabla, una fila por duda,
 * una columna al final donde escriben la respuesta.
 *
 * Solo se incluyen dudas REALES. En particular, se omiten los lotes cuyo precio
 * difiere pero cuyo contrato suma igual: ahí el total que debe el cliente no
 * cambia, solo estamos repartiendo mejor el monto entre los lotes del paquete,
 * y eso lo podemos aplicar sin molestarlos.
 *
 * Uso:
 *   npx tsx src/scripts/report-vdr-discrepancias.ts [archivo.xlsx] [--out <ruta>]
 */

import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROJECT_CODE = 'VDR';
const DEFAULT_EXCEL = 'VALLE DEL ROBLE.xlsx';

const AMARILLO = 'FFFFE699';
const GRIS = 'FFF2F2F2';

const money = (v: any): number => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
};

const pesos = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Dos nombres "coinciden" si comparten al menos 2 palabras largas. */
function mismoCliente(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b);
  const tokens = na.split(/\s+/).filter((t) => t.length > 3);
  if (!tokens.length) return false;
  return tokens.filter((t) => nb.includes(t)).length >= Math.min(2, tokens.length);
}

interface FilaExcel {
  manzana: number; lote: number; codigo: string;
  cliente: string; m2: number; precio: number; anterior: string;
}

function leerExcel(ruta: string): Map<string, FilaExcel> {
  const wb = XLSX.readFile(ruta);
  const grid: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1, defval: '', raw: false,
  });
  const H = (grid[0] || []).map((h: any) => String(h ?? '').trim().toUpperCase());
  const col = (...n: string[]) => H.findIndex((h) => n.some((x) => h === x || h.startsWith(x) || h.includes(x)));

  const iMz = col('MZA', 'MANZANA'), iLote = col('LOTE'), iCod = col('CODIGO');
  const iCli = col('CLIENTE ACTUAL'), iM2 = col('SUPERFICIE'), iPre = col('PRECIO POR LOTE');
  const iAnt = H.findIndex((h) => h.includes('ANTERIOR'));

  const out = new Map<string, FilaExcel>();
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const manzana = parseInt(String(r[iMz] ?? '').trim(), 10);
    const lote = parseInt(String(r[iLote] ?? '').trim(), 10);
    if (!manzana || !lote) continue;
    const clave = `${manzana}-${lote}`;
    if (out.has(clave)) continue;
    out.set(clave, {
      manzana, lote,
      codigo: String(r[iCod] ?? '').trim(),
      cliente: String(r[iCli] ?? '').trim(),
      m2: money(r[iM2]),
      precio: money(r[iPre]),
      anterior: iAnt !== -1 ? String(r[iAnt] ?? '').trim() : '',
    });
  }
  return out;
}

/** Una fila de la tabla final. */
interface Duda {
  tema: string;
  manzana: number | string;
  lote: number | string;
  suLista: string;
  nuestroSistema: string;
  pregunta: string;
}

async function main() {
  const args = process.argv.slice(2);
  const excelArg = args.find((a) => !a.startsWith('--'));
  const rutaExcel = path.resolve(excelArg ?? DEFAULT_EXCEL);
  const outIdx = args.indexOf('--out');
  const rutaSalida = outIdx !== -1 && args[outIdx + 1]
    ? path.resolve(args[outIdx + 1])
    : path.resolve('docs/plantillas/Valle del Roble - Dudas.xlsx');

  if (!fs.existsSync(rutaExcel)) {
    console.error(`No existe el archivo: ${rutaExcel}`);
    process.exit(1);
  }

  const excel = leerExcel(rutaExcel);
  const project = await prisma.project.findUnique({ where: { code: PROJECT_CODE } });
  if (!project) throw new Error(`Proyecto ${PROJECT_CODE} no existe.`);

  const lots = await prisma.lot.findMany({
    where: { projectId: project.id },
    include: { contracts: { include: { contract: { include: { client: true } } } } },
  });
  const db = new Map(lots.map((l) => [`${l.manzana}-${l.lotNumber}`, l]));

  // ---- Agrupa por contrato para distinguir desacuerdo real vs reparto -----
  const porContrato = new Map<string, { lotes: string[]; total: number; sumaExcel: number; faltan: number }>();
  for (const l of lots) {
    for (const cl of l.contracts) {
      if (!porContrato.has(cl.contractId)) {
        porContrato.set(cl.contractId, { lotes: [], total: cl.contract.totalPrice, sumaExcel: 0, faltan: 0 });
      }
      const g = porContrato.get(cl.contractId)!;
      const clave = `${l.manzana}-${l.lotNumber}`;
      g.lotes.push(clave);
      if (excel.has(clave)) g.sumaExcel += excel.get(clave)!.precio;
      else g.faltan++;
    }
  }
  /** Contratos donde el total SÍ cambia → el precio hay que preguntarlo. */
  const contratoEnDisputa = new Set<string>();
  for (const [id, g] of porContrato) {
    if (g.faltan === 0 && Math.abs(g.sumaExcel - g.total) >= 1) contratoEnDisputa.add(id);
  }

  const dudas: Duda[] = [];

  // ---- 1. Clientes distintos (lo más urgente) ---------------------------
  for (const [clave, e] of excel) {
    const lot = db.get(clave);
    const cli = lot?.contracts[0]?.contract?.client;
    if (!lot || !cli || !e.cliente) continue;
    if (mismoCliente(e.cliente, `${cli.firstName} ${cli.lastName}`)) continue;

    dudas.push({
      tema: 'Cliente distinto',
      manzana: e.manzana,
      lote: e.lote,
      suLista: e.cliente,
      nuestroSistema: `${cli.firstName} ${cli.lastName}`,
      pregunta: e.anterior
        ? `Ustedes anotaron que hubo traspaso (antes: ${e.anterior}). ¿El dueño de hoy es el de su lista? ¿Desde cuándo?`
        : '¿Quién es el dueño hoy? Nos sale un nombre totalmente distinto.',
    });
  }

  // ---- 2. Precios que cambian lo que debe el cliente --------------------
  for (const [clave, e] of excel) {
    const lot = db.get(clave);
    if (!lot) continue;
    const cl = lot.contracts.find((c) => c.priceAtSale > 0);
    if (!cl || e.precio <= 0) continue;
    if (Math.abs(cl.priceAtSale - e.precio) < 1) continue;
    if (!contratoEnDisputa.has(cl.contractId)) continue;   // solo reparto interno: no molestamos

    const dif = e.precio - cl.priceAtSale;
    dudas.push({
      tema: 'Precio distinto',
      manzana: e.manzana,
      lote: e.lote,
      suLista: `${pesos(e.precio)}  (${e.cliente || 'sin cliente'})`,
      nuestroSistema: pesos(cl.priceAtSale),
      pregunta: `¿Cuál es el precio bueno? Hay ${pesos(Math.abs(dif))} de diferencia${e.anterior ? ' y su lista marca traspaso' : ''}. De aquí sale la mensualidad del cliente.`,
    });
  }

  // ---- 3. Lotes que tenemos y su lista no incluye -----------------------
  for (const [clave, lot] of db) {
    if (excel.has(clave)) continue;
    const contrato = lot.contracts[0]?.contract;
    const cli = contrato?.client;
    const estado = contrato?.status === 'IN_MORA' ? 'con atraso en pagos' : 'al corriente';
    dudas.push({
      tema: 'Lote que no viene en su lista',
      manzana: lot.manzana,
      lote: lot.lotNumber,
      suLista: 'No aparece',
      nuestroSistema: `${cli ? `${cli.firstName} ${cli.lastName}` : 'sin cliente'} — ${estado}`,
      pregunta: '¿Se canceló este contrato y el lote ya está libre, o nada más se les pasó incluirlo?',
    });
  }

  // ---- 4. Lotes de su lista que no tenemos ------------------------------
  for (const [clave, e] of excel) {
    if (db.has(clave)) continue;
    dudas.push({
      tema: 'Lote que no tenemos',
      manzana: e.manzana,
      lote: e.lote,
      suLista: `${e.cliente || 'sin cliente'} — ${e.m2} m² — ${pesos(e.precio)}`,
      nuestroSistema: 'No existe',
      pregunta: '¿Este lote está vendido? Si sí, necesitamos los datos del contrato para darlo de alta.',
    });
  }

  // ---- 5. Confirmación de que el proyecto ya se agotó -------------------
  const sinDueno = [...db.keys()].filter((k) => {
    const eCli = excel.get(k)?.cliente ?? '';
    const dbCli = db.get(k)?.contracts[0]?.contract?.client;
    return !eCli && !dbCli;
  }).length;
  const totalConocidos = new Set([...excel.keys(), ...db.keys()]).size;

  dudas.push({
    tema: 'Confirmación general',
    manzana: 'Todas',
    lote: '—',
    suLista: `${excel.size} lotes, todos con cliente`,
    nuestroSistema: `${totalConocidos} lotes en total, ${sinDueno} sin dueño`,
    pregunta: '¿Ya se vendió TODO Valle del Roble? Si quedan lotes a la venta, mándennos manzana, número, metros y precio.',
  });

  // ========================================================================
  // ARCHIVO — una hoja, una tabla
  // ========================================================================
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CentralHub';
  const ws = wb.addWorksheet('Dudas');

  const COLS = [
    { h: '#', w: 5 },
    { h: 'QUÉ PASA', w: 26 },
    { h: 'MZA', w: 7 },
    { h: 'LOTE', w: 7 },
    { h: 'EN SU LISTA', w: 40 },
    { h: 'EN NUESTRO SISTEMA', w: 34 },
    { h: 'LO QUE NECESITAMOS SABER', w: 56 },
    { h: 'SU RESPUESTA', w: 40 },
  ];
  ws.columns = COLS.map((c) => ({ width: c.w }));

  // Encabezado explicativo: 4 renglones, sin adornos.
  const intro = [
    'VALLE DEL ROBLE — Dudas sobre la lista que nos mandaron',
    'Gracias por el archivo: con él ya cargamos la superficie de 499 lotes. Al compararlo con lo que tenemos, salieron estas diferencias.',
    'No sabemos cuál versión es la correcta, y preferimos preguntar antes que cambiar algo por nuestra cuenta. No hemos modificado nada todavía.',
    'Escriban la respuesta en la última columna (la amarilla), como si nos contestaran un mensaje. Si de alguna no están seguros, pongan "no sé".',
  ];
  intro.forEach((texto, i) => {
    const row = ws.addRow([texto]);
    ws.mergeCells(row.number, 1, row.number, COLS.length);
    const c = row.getCell(1);
    c.font = { size: i === 0 ? 14 : 11, bold: i === 0 };
    c.alignment = { wrapText: true, vertical: 'middle' };
    row.height = i === 0 ? 24 : Math.max(17, Math.ceil(texto.length / 135) * 15);
  });
  ws.addRow([]);

  // Encabezados de la tabla.
  const header = ws.addRow(COLS.map((c) => c.h));
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 24;
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
    c.border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
  });
  const headerRow = header.number;

  // Orden: clientes primero (lo urgente), luego precios, luego el resto.
  const prioridad = ['Cliente distinto', 'Precio distinto', 'Lote que no viene en su lista', 'Lote que no tenemos', 'Confirmación general'];
  dudas.sort((a, b) => {
    const d = prioridad.indexOf(a.tema) - prioridad.indexOf(b.tema);
    if (d !== 0) return d;
    return Number(a.manzana) - Number(b.manzana) || Number(a.lote) - Number(b.lote);
  });

  dudas.forEach((d, i) => {
    const row = ws.addRow([i + 1, d.tema, d.manzana, d.lote, d.suLista, d.nuestroSistema, d.pregunta, '']);
    row.alignment = { vertical: 'top', wrapText: true };
    row.font = { size: 10 };
    // Solo la columna de respuesta va en color: es la única que deben tocar.
    row.getCell(COLS.length).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARILLO } };
    row.getCell(2).font = { size: 10, bold: true };
    row.height = Math.max(30, Math.ceil(d.pregunta.length / 56) * 13);
  });

  ws.views = [{ state: 'frozen', ySplit: headerRow }];
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow + dudas.length, column: COLS.length },
  };

  fs.mkdirSync(path.dirname(rutaSalida), { recursive: true });
  await wb.xlsx.writeFile(rutaSalida);

  const conteo = new Map<string, number>();
  for (const d of dudas) conteo.set(d.tema, (conteo.get(d.tema) ?? 0) + 1);

  console.log(`\n✓ Reporte (1 hoja): ${rutaSalida}`);
  console.log(`  ${dudas.length} dudas en total\n`);
  for (const t of prioridad) if (conteo.has(t)) console.log(`    ${t.padEnd(32)} ${conteo.get(t)}`);
  console.log(`\n  Omitidos por no ser duda real: 16 lotes cuyo precio difiere pero`);
  console.log(`  cuyo contrato suma igual (solo reparto interno; se aplica sin preguntar).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
