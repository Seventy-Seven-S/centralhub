/**
 * ============================================================================
 * import-vdr-superficies.ts — Importa las superficies (m²) de Valle del Roble
 * ============================================================================
 *
 * Fuente: "VALLE DEL ROBLE.xlsx" entregado por el equipo de la inmobiliaria
 * (agosto 2026), hoja única, encabezados en la fila 1:
 *   PROYECTO | MZA | LOTE | CODIGO | CLIENTE ACTUAL | MENSUALIDAD |
 *   SUPERFICIE M2 | PRECIO POR LOTE | ... | CODIGO Y CLIENTE ANTERIOR
 *
 * ALCANCE DELIBERADO: este script SOLO escribe `Lot.areaM2`.
 * No toca precios ni clientes: esas diferencias están en disputa con el equipo
 * y se reportan aparte (ver report-vdr-discrepancias.ts). Importar superficies
 * es puro dato nuevo — VDR tenía areaM2 = 0 en los 512 lotes.
 *
 * Uso:
 *   npx tsx src/scripts/import-vdr-superficies.ts            # dry-run
 *   npx tsx src/scripts/import-vdr-superficies.ts --apply     # escribe
 */

import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROJECT_CODE = 'VDR';
const DEFAULT_EXCEL = 'VALLE DEL ROBLE.xlsx';
const SHEET = 'VALLE DEL ROBLE';

/** Superficie fuera de este rango se considera error de captura y se omite. */
const M2_MIN = 50;
const M2_MAX = 2000;

function parseNumero(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

interface FilaExcel {
  manzana: number;
  lote: number;
  m2: number;
}

function leerExcel(rutaExcel: string): { filas: FilaExcel[]; sospechosas: string[] } {
  const wb = XLSX.readFile(rutaExcel);
  const nombreHoja = wb.SheetNames.includes(SHEET) ? SHEET : wb.SheetNames[0];
  const grid: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], {
    header: 1, defval: '', raw: false,
  });

  // Localiza columnas por nombre para no depender de posiciones fijas.
  const headers = (grid[0] || []).map((h: any) => String(h ?? '').trim().toUpperCase());
  const idxMz = headers.findIndex((h) => h === 'MZA' || h.startsWith('MANZANA'));
  const idxLote = headers.findIndex((h) => h === 'LOTE');
  const idxM2 = headers.findIndex((h) => h.includes('SUPERFICIE'));

  if (idxMz === -1 || idxLote === -1 || idxM2 === -1) {
    throw new Error(
      `Columnas no encontradas en "${nombreHoja}" (mza=${idxMz}, lote=${idxLote}, m2=${idxM2}). ` +
      `Headers: ${headers.filter(Boolean).join(' | ')}`
    );
  }

  const filas: FilaExcel[] = [];
  const sospechosas: string[] = [];
  const vistos = new Set<string>();

  for (let i = 1; i < grid.length; i++) {
    const row = grid[i] || [];
    const manzana = parseInt(String(row[idxMz] ?? '').trim(), 10);
    const lote = parseInt(String(row[idxLote] ?? '').trim(), 10);
    if (!manzana || !lote) continue;          // filas vacías / encabezados repetidos

    const clave = `${manzana}-${lote}`;
    if (vistos.has(clave)) {
      sospechosas.push(`${clave}: duplicado en el Excel — se ignora la repetición.`);
      continue;
    }
    vistos.add(clave);

    const m2 = parseNumero(row[idxM2]);
    if (m2 <= 0) {
      sospechosas.push(`${clave}: sin superficie en el Excel.`);
      continue;
    }
    if (m2 < M2_MIN || m2 > M2_MAX) {
      sospechosas.push(`${clave}: superficie fuera de rango (${m2} m²) — se omite por seguridad.`);
      continue;
    }

    filas.push({ manzana, lote, m2 });
  }

  return { filas, sospechosas };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const excelArg = args.find((a) => !a.startsWith('--'));
  const rutaExcel = path.resolve(excelArg ?? DEFAULT_EXCEL);

  if (!fs.existsSync(rutaExcel)) {
    console.error(`No existe el archivo: ${rutaExcel}`);
    process.exit(1);
  }

  const { filas, sospechosas } = leerExcel(rutaExcel);

  const project = await prisma.project.findUnique({ where: { code: PROJECT_CODE } });
  if (!project) throw new Error(`Proyecto ${PROJECT_CODE} no existe en la base de datos.`);

  const lots = await prisma.lot.findMany({ where: { projectId: project.id } });
  const porClave = new Map(lots.map((l) => [`${l.manzana}-${l.lotNumber}`, l]));

  const aEscribir: { id: string; clave: string; antes: number; despues: number }[] = [];
  const yaIguales: string[] = [];
  const cambiaExistente: string[] = [];
  const sinLoteEnBD: string[] = [];

  for (const f of filas) {
    const clave = `${f.manzana}-${f.lote}`;
    const lot = porClave.get(clave);
    if (!lot) { sinLoteEnBD.push(clave); continue; }

    if (Math.abs(lot.areaM2 - f.m2) < 0.01) { yaIguales.push(clave); continue; }
    if (lot.areaM2 > 0) {
      // No sobreescribimos en silencio un m² que ya teníamos.
      cambiaExistente.push(`${clave}: BD ${lot.areaM2} m² → Excel ${f.m2} m²`);
    }
    aEscribir.push({ id: lot.id, clave, antes: lot.areaM2, despues: f.m2 });
  }

  const sinDatoEnExcel = lots.filter(
    (l) => l.areaM2 <= 0 && !filas.some((f) => `${f.manzana}-${f.lote}` === `${l.manzana}-${l.lotNumber}`)
  );

  // ---- Reporte ----------------------------------------------------------
  console.log(`\nArchivo:  ${rutaExcel}`);
  console.log(`Proyecto: ${PROJECT_CODE} — ${project.name} (${lots.length} lotes en BD)\n`);
  console.log(`  Filas con superficie válida en el Excel: ${filas.length}`);
  console.log(`  Lotes que se actualizarán:               ${aEscribir.length}`);
  console.log(`  Ya tenían la misma superficie:           ${yaIguales.length}`);
  console.log(`  Superficie que CAMBIA una ya existente:  ${cambiaExistente.length}`);
  console.log(`  Filas del Excel sin lote en BD:          ${sinLoteEnBD.length}${sinLoteEnBD.length ? ` (${sinLoteEnBD.join(', ')})` : ''}`);
  console.log(`  Lotes en BD que siguen sin superficie:   ${sinDatoEnExcel.length}${sinDatoEnExcel.length ? ` (${sinDatoEnExcel.map((l) => `${l.manzana}-${l.lotNumber}`).join(', ')})` : ''}`);

  if (cambiaExistente.length) {
    console.log('\n  Cambios sobre superficies ya cargadas (revisar):');
    cambiaExistente.slice(0, 20).forEach((c) => console.log(`    ${c}`));
  }
  if (sospechosas.length) {
    console.log(`\n  Filas omitidas del Excel (${sospechosas.length}):`);
    sospechosas.slice(0, 20).forEach((s) => console.log(`    ${s}`));
    if (sospechosas.length > 20) console.log(`    ... y ${sospechosas.length - 20} más.`);
  }

  const totalM2 = aEscribir.reduce((a, x) => a + x.despues, 0) + yaIguales.length;
  console.log(`\n  Superficie total a registrar: ${totalM2.toLocaleString('es-MX', { maximumFractionDigits: 2 })} m²`);

  if (!apply) {
    console.log('\n  DRY-RUN — no se escribió nada. Vuelve a correr con --apply para aplicar.\n');
    return;
  }

  // ---- Escritura --------------------------------------------------------
  console.log('\n  Aplicando...');
  let n = 0;
  for (const chunkStart of [...Array(Math.ceil(aEscribir.length / 50)).keys()]) {
    const chunk = aEscribir.slice(chunkStart * 50, chunkStart * 50 + 50);
    await prisma.$transaction(
      chunk.map((x) => prisma.lot.update({ where: { id: x.id }, data: { areaM2: x.despues } }))
    );
    n += chunk.length;
  }

  const verif = await prisma.lot.count({ where: { projectId: project.id, areaM2: { gt: 0 } } });
  console.log(`  ✓ ${n} lotes actualizados.`);
  console.log(`  ✓ Verificación: ${verif}/${lots.length} lotes de ${PROJECT_CODE} tienen superficie.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
