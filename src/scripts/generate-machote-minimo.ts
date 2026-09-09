/**
 * ============================================================================
 * generate-machote-minimo.ts — Machote mínimo para el equipo de la inmobiliaria
 * ============================================================================
 *
 * Reemplaza al machote anterior (generate-lots-template.ts), que el equipo no
 * pudo llenar: 14 pestañas, celdas bloqueadas, dropdowns y código de colores
 * resultaron un obstáculo, no una ayuda.
 *
 * Este archivo es deliberadamente tonto:
 *   - UNA sola hoja.
 *   - CINCO columnas, con los mismos nombres que ellos usaron en su archivo
 *     de Valle del Roble (PROYECTO / MZA / LOTE / SUPERFICIE M2 / PRECIO POR LOTE).
 *   - Sin colores, sin protección, sin listas desplegables, sin hoja de
 *     instrucciones, sin filas ocultas. Todo editable.
 *
 * Solo incluye lotes a los que les falta superficie o precio, más filas en
 * blanco al final de cada proyecto por si quieren agregar lotes que no tenemos.
 *
 * Uso:
 *   npx tsx src/scripts/generate-machote-minimo.ts [--out <ruta.xlsx>]
 */

import ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Columnas con los nombres que el equipo ya usa en sus propios archivos. */
const COLUMNAS = [
  { header: 'PROYECTO', width: 12 },
  { header: 'MZA', width: 8 },
  { header: 'LOTE', width: 8 },
  { header: 'SUPERFICIE M2', width: 16 },
  { header: 'PRECIO POR LOTE', width: 18 },
];

/** Filas vacías al final de cada proyecto para capturar lotes que no tenemos. */
const FILAS_EXTRA = 40;

/** Proyectos ya resueltos que no vale la pena incluir. */
const OMITIR = new Set(['VDR']);   // Valle del Roble llegó completo en agosto 2026.

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPath = outIdx !== -1 && args[outIdx + 1]
    ? path.resolve(args[outIdx + 1])
    : path.resolve('docs/plantillas/Lotes - formato para llenar.xlsx');

  const projects = await prisma.project.findMany({ orderBy: { code: 'asc' } });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CentralHub';
  const ws = wb.addWorksheet('Lotes');
  ws.columns = COLUMNAS.map((c) => ({ width: c.width }));

  // Encabezados: negritas y nada más. Sin fondo de color, sin bordes.
  const header = ws.addRow(COLUMNAS.map((c) => c.header));
  header.font = { bold: true };

  let totalFilas = 0;
  const resumen: { code: string; faltantes: number }[] = [];

  for (const pr of projects) {
    if (OMITIR.has(pr.code)) continue;

    const lots = await prisma.lot.findMany({
      where: { projectId: pr.id },
      orderBy: [{ manzana: 'asc' }, { lotNumber: 'asc' }],
      include: { contracts: true },
    });

    // Solo los lotes a los que les falta algo. Si ya tenemos superficie y
    // precio, no tiene caso ponerlos a revisar lo que ya está bien.
    const faltantes = lots.filter((l) => {
      const sinM2 = !l.areaM2 || l.areaM2 <= 0;
      const precio = l.currentPrice > 0
        ? l.currentPrice
        : (l.contracts.find((c) => c.priceAtSale > 0)?.priceAtSale ?? 0);
      return sinM2 || precio <= 0;
    });

    // Proyecto sin nada que pedir: ni datos faltantes ni lotes por capturar.
    // No lo incluimos para no llenar el archivo de filas inútiles.
    const inventarioCompleto = lots.length >= pr.totalLots;
    if (faltantes.length === 0 && inventarioCompleto) continue;

    for (const l of faltantes) {
      ws.addRow([pr.code, l.manzana, Number(l.lotNumber) || l.lotNumber, null, null]);
      totalFilas++;
    }

    // Filas en blanco con el código de proyecto ya puesto, para que agregar un
    // lote sea solo escribir manzana, número, m² y precio.
    for (let i = 0; i < FILAS_EXTRA; i++) {
      ws.addRow([pr.code, null, null, null, null]);
    }

    resumen.push({ code: pr.code, faltantes: faltantes.length });
  }


  ws.views = [{ state: 'frozen', ySplit: 1 }];

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await wb.xlsx.writeFile(outPath);

  console.log(`\n✓ Machote mínimo: ${outPath}`);
  console.log(`  1 hoja, ${COLUMNAS.length} columnas, sin colores ni bloqueos.`);
  console.log(`  Lotes que necesitan dato: ${totalFilas}`);
  console.log(`  + ${FILAS_EXTRA} filas en blanco por proyecto para agregar lotes.\n`);
  for (const r of resumen) {
    console.log(`    ${r.code.padEnd(6)} ${String(r.faltantes).padStart(4)} lotes`);
  }
  console.log(`\n  (Valle del Roble omitido: ya llegó completo.)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
