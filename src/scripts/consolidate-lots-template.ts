/**
 * ============================================================================
 * consolidate-lots-template.ts — Consolida el machote llenado por la
 * inmobiliaria y lo normaliza al formato que lee `readLotsFromTemplate()`.
 * ============================================================================
 *
 * El machote (generate-lots-template.ts) trae:
 *   - Una hoja "INSTRUCCIONES" que hay que ignorar.
 *   - Una hoja por proyecto, con encabezados en la fila 2.
 *   - Columnas extra informativas (Cliente actual, Notas).
 *
 * `readLotsFromTemplate()` en cambio espera: primera hoja, encabezados en la
 * fila 1, columnas Proyecto | Manzana | Lote | Superficie_m2 | Precio |
 * Precio_m2 | Estatus. Este script hace ese puente y de paso valida.
 *
 * Uso:
 *   npx tsx src/scripts/consolidate-lots-template.ts <machote-llenado.xlsx> [--out <ruta.xlsx>]
 *
 * Salida (en la carpeta `--out`, por defecto "consolidado/" junto al machote):
 *   - `Inventario-Lotes-<CODIGO>.xlsx` — uno por proyecto, listo para
 *     `migrate-lots.ts --source template`.
 *   - `Inventario-Lotes-TODOS.xlsx` — todo junto, solo para revisión humana.
 *   - Un reporte de validación en consola (filas descartadas, duplicados,
 *     lotes sin superficie o sin precio).
 *
 * OJO: la importación es POR PROYECTO. `readLotsFromTemplate()` deduplica por
 * "manzana-lote" sin considerar el proyecto, así que un archivo combinado
 * colapsaría lotes de proyectos distintos que comparten manzana y número.
 * Por eso el archivo TODOS no se importa: es solo para revisar.
 */

import ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';

const HOJA_IGNORADA = 'INSTRUCCIONES';
const HEADER_ROW = 2;

const SALIDA_HEADERS = [
  'Proyecto', 'Manzana', 'Lote', 'Superficie_m2', 'Precio', 'Precio_m2', 'Estatus',
];

const ESTATUS_VALIDOS = ['DISPONIBLE', 'VENDIDO', 'RESERVADO', 'NO DISPONIBLE'];

interface FilaConsolidada {
  proyecto: string;
  manzana: number;
  lote: string;
  superficie: number;
  precio: number;
  precioM2: number;
  estatus: string;
}

interface Problema {
  hoja: string;
  fila: number;
  detalle: string;
}

/** "$125,000.00" → 125000 ; celdas de ExcelJS que ya son número pasan tal cual. */
function parseNumero(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && 'result' in val) return parseNumero((val as any).result);
  const n = parseFloat(String(val).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function texto(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if ('text' in val) return String((val as any).text).trim();
    if ('result' in val) return String((val as any).result).trim();
    if ('richText' in val) return (val as any).richText.map((t: any) => t.text).join('').trim();
  }
  return String(val).trim();
}

/** Mapa nombre-de-columna → índice, tolerante a mayúsculas y espacios. */
function mapearColumnas(row: ExcelJS.Row): Record<string, number> {
  const map: Record<string, number> = {};
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const h = texto(cell.value).toUpperCase().replace(/\s+/g, ' ');
    if (h.startsWith('PROYECTO')) map.proyecto = col;
    else if (h.startsWith('MANZANA')) map.manzana = col;
    else if (h.startsWith('LOTE')) map.lote = col;
    else if (h.startsWith('SUPERFICIE')) map.superficie = col;
    else if (/^PRECIO[_ ]?M2/.test(h)) map.precioM2 = col;
    else if (h === 'PRECIO') map.precio = col;
    else if (h.startsWith('ESTATUS')) map.estatus = col;
  });
  return map;
}

async function main() {
  const args = process.argv.slice(2);
  const entrada = args.find((a) => !a.startsWith('--'));
  if (!entrada) {
    console.error('Uso: npx tsx src/scripts/consolidate-lots-template.ts <machote-llenado.xlsx> [--out <ruta.xlsx>]');
    process.exit(1);
  }
  const rutaEntrada = path.resolve(entrada);
  if (!fs.existsSync(rutaEntrada)) {
    console.error(`No existe el archivo: ${rutaEntrada}`);
    process.exit(1);
  }

  const outIdx = args.indexOf('--out');
  const dirSalida = outIdx !== -1 && args[outIdx + 1]
    ? path.resolve(args[outIdx + 1])
    : path.resolve(path.dirname(rutaEntrada), 'consolidado');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(rutaEntrada);

  const filas: FilaConsolidada[] = [];
  const problemas: Problema[] = [];
  const resumen: Record<string, { total: number; sinM2: number; sinPrecio: number; nuevos: number }> = {};

  for (const ws of wb.worksheets) {
    if (ws.name.trim().toUpperCase() === HOJA_IGNORADA) continue;

    const cols = mapearColumnas(ws.getRow(HEADER_ROW));
    if (cols.manzana === undefined || cols.lote === undefined) {
      problemas.push({ hoja: ws.name, fila: HEADER_ROW, detalle: 'No se encontraron columnas Manzana/Lote — hoja omitida.' });
      continue;
    }

    const vistos = new Set<string>();
    resumen[ws.name] = { total: 0, sinM2: 0, sinPrecio: 0, nuevos: 0 };

    for (let r = HEADER_ROW + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);

      const manzana = parseInt(texto(row.getCell(cols.manzana).value), 10);
      const loteRaw = texto(row.getCell(cols.lote).value);

      // Filas en blanco (las que dejamos para capturar) y el separador rojo.
      if (!manzana || !loteRaw) continue;

      const lote = String(parseInt(loteRaw.match(/\d+/)?.[0] ?? '', 10) || loteRaw);
      const clave = `${manzana}-${lote}`;
      if (vistos.has(clave)) {
        problemas.push({ hoja: ws.name, fila: r, detalle: `Lote duplicado ${clave} — se conserva la primera aparición.` });
        continue;
      }
      vistos.add(clave);

      const proyecto = cols.proyecto !== undefined
        ? texto(row.getCell(cols.proyecto).value) || ws.name
        : ws.name;

      const superficie = cols.superficie !== undefined ? parseNumero(row.getCell(cols.superficie).value) : 0;
      const precio = cols.precio !== undefined ? parseNumero(row.getCell(cols.precio).value) : 0;
      const precioM2 = cols.precioM2 !== undefined ? parseNumero(row.getCell(cols.precioM2).value) : 0;

      let estatus = cols.estatus !== undefined ? texto(row.getCell(cols.estatus).value).toUpperCase() : '';
      if (estatus && !ESTATUS_VALIDOS.includes(estatus)) {
        problemas.push({ hoja: ws.name, fila: r, detalle: `Estatus no reconocido: "${estatus}" — se deja vacío para que el importador lo deduzca.` });
        estatus = '';
      }

      if (superficie <= 0) {
        resumen[ws.name].sinM2++;
        problemas.push({ hoja: ws.name, fila: r, detalle: `Lote ${clave} sin Superficie_m2.` });
      }
      if (precio <= 0 && precioM2 <= 0) {
        resumen[ws.name].sinPrecio++;
        problemas.push({ hoja: ws.name, fila: r, detalle: `Lote ${clave} sin Precio ni Precio_m2.` });
      }

      resumen[ws.name].total++;
      filas.push({ proyecto, manzana, lote, superficie, precio, precioM2, estatus });
    }
  }

  // ---- Escribir los archivos planos en formato de importador --------------
  fs.mkdirSync(dirSalida, { recursive: true });

  /** Escribe un .xlsx de una sola hoja con los encabezados del importador. */
  async function escribirPlano(ruta: string, datos: FilaConsolidada[]) {
    const salida = new ExcelJS.Workbook();
    salida.creator = 'CentralHub';
    const hoja = salida.addWorksheet('Lotes');
    hoja.addRow(SALIDA_HEADERS);
    hoja.getRow(1).font = { bold: true };
    for (const f of datos) {
      hoja.addRow([f.proyecto, f.manzana, f.lote, f.superficie || '', f.precio || '', f.precioM2 || '', f.estatus]);
    }
    hoja.columns.forEach((c) => { c.width = 15; });
    await salida.xlsx.writeFile(ruta);
  }

  const porProyecto = new Map<string, FilaConsolidada[]>();
  for (const f of filas) {
    const k = f.proyecto.toUpperCase();
    if (!porProyecto.has(k)) porProyecto.set(k, []);
    porProyecto.get(k)!.push(f);
  }

  const archivos: { code: string; ruta: string; n: number }[] = [];
  for (const [code, datos] of [...porProyecto.entries()].sort()) {
    const ruta = path.join(dirSalida, `Inventario-Lotes-${code}.xlsx`);
    await escribirPlano(ruta, datos);
    archivos.push({ code, ruta, n: datos.length });
  }

  const rutaTodos = path.join(dirSalida, 'Inventario-Lotes-TODOS.xlsx');
  await escribirPlano(rutaTodos, filas);

  // ---- Reporte -----------------------------------------------------------
  console.log(`\n✓ Consolidado en: ${dirSalida}`);
  console.log(`  ${archivos.length} archivos por proyecto + Inventario-Lotes-TODOS.xlsx (solo revisión)`);
  console.log(`  Lotes leídos: ${filas.length}\n`);
  console.log('  Proyecto   Lotes   sin m²   sin precio');
  for (const [hojaNombre, r] of Object.entries(resumen)) {
    console.log(`  ${hojaNombre.padEnd(10)} ${String(r.total).padStart(5)}   ${String(r.sinM2).padStart(6)}   ${String(r.sinPrecio).padStart(10)}`);
  }

  if (problemas.length) {
    const graves = problemas.filter((p) => !/sin Superficie_m2|sin Precio ni/.test(p.detalle));
    console.log(`\n  Observaciones: ${problemas.length} (${graves.length} que requieren revisión manual)`);
    for (const p of graves.slice(0, 40)) {
      console.log(`    ${p.hoja} fila ${p.fila}: ${p.detalle}`);
    }
    if (graves.length > 40) console.log(`    ... y ${graves.length - 40} más.`);
  }

  console.log(`\n  Siguiente paso — importar UN proyecto a la vez (nunca el archivo TODOS):`);
  for (const a of archivos.slice(0, 3)) {
    console.log(`    npx tsx src/scripts/migrate-lots.ts --source template --excel "${a.ruta}" --code ${a.code} [--apply]`);
  }
  if (archivos.length > 3) console.log(`    ... y así para los ${archivos.length - 3} proyectos restantes.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
