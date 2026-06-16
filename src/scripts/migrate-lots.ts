/**
 * ============================================================================
 * migrate-lots.ts — CAPA DE LOTES de la migración (genérico para los proyectos)
 * ============================================================================
 *
 * PROPÓSITO
 *   Carga el inventario de LOTES y lo vincula a los contratos ya migrados.
 *   Tres fuentes de inventario (flag --source):
 *
 *     1) codigos      Lotes VENDIDOS derivados de la hoja "Códigos" (los 12).
 *                     Crea Lot(status=SOLD) y ContractLot ligado al contrato
 *                     por código de cliente. areaM2/basePrice=0 (la hoja no los
 *                     trae). Maneja multi-lote ("10 y 11", "4,5,6,7", "21-22-23").
 *
 *     2) concentrado  Inventario COMPLETO de JSA 1/2/3 desde la hoja
 *                     "Concentrado " (header fila 8). Crea TODOS los lotes con
 *                     areaM2 (JSA1), basePrice (Precio de Venta) y status
 *                     (SOLD/RESERVED/UNAVAILABLE/AVAILABLE). Vincula los vendidos
 *                     a contratos cruzando con la hoja "Codigos de Cliente" del
 *                     mismo archivo.
 *
 *     3) template     Plantilla del becario para los 9 proyectos restantes:
 *                     Proyecto | Manzana | Lote | Superficie_m2 | Precio |
 *                     Precio_m2 | Estatus. Crea todos los lotes; status por
 *                     "Estatus" o deducido (SOLD si empata un contrato migrado);
 *                     vincula los vendidos. Usar --codigos <SISTEMA.xlsx> para
 *                     poder empatar lote↔contrato por código.
 *
 * SEGURIDAD
 *   - Por DEFECTO es DRY-RUN: reporta counts y NO escribe NADA a la DB.
 *   - Solo escribe con el flag explícito --confirm.
 *   - Idempotente: no duplica lotes (unique projectId+manzana+lotNumber) ni
 *     vínculos contrato↔lote ya existentes.
 *
 * USO
 *   # JSA 1 inventario completo (dry-run):
 *   tsx src/scripts/migrate-lots.ts --source concentrado \
 *       --excel "/ruta/JSA 1.xlsx" --project "JSA 1"
 *
 *   # SISTEMA: lotes vendidos desde Códigos (dry-run):
 *   tsx src/scripts/migrate-lots.ts --source codigos \
 *       --excel "/ruta/SISTEMA BETANIA.xlsx" --project "Betania"
 *
 *   # Plantilla del becario (dry-run); --codigos para vincular ventas:
 *   tsx src/scripts/migrate-lots.ts --source template \
 *       --excel "/ruta/inventario_becario.xlsx" --project "Santander" \
 *       --codigos "/ruta/SISTEMA SANTANDER.xlsx"
 *
 *   # Escribir de verdad: añade --confirm
 *
 * FLAGS
 *   --source <codigos|concentrado|template>   Fuente de inventario (requerido)
 *   --excel <ruta>                            Excel de la fuente (requerido)
 *   --codigos <ruta>                          Excel con la hoja Códigos para
 *                                             vincular (default: --excel)
 *   --project <nombre> | --code <code> | --projectId <uuid>   Proyecto destino
 *   --confirm                                 ESCRIBE a la DB (sin él = dry-run)
 */

import { PrismaClient, LotStatus } from '@prisma/client';
import * as path from 'path';
import {
  ParsedLot,
  readSoldLotsFromCodigos,
  readLotsFromConcentrado,
  readLotsFromTemplate,
  readCodigos,
  buildLotCodigoIndex,
} from './lib/lots';

const prisma = new PrismaClient();

type Source = 'codigos' | 'concentrado' | 'template';

interface LotPlan {
  lots: ParsedLot[];          // inventario a crear (con codigoLegado resuelto en vendidos)
  source: Source;
}

// ============================================================================
// CONSTRUCCIÓN DEL PLAN (sin DB) — qué lotes y qué vínculos
// ============================================================================

function buildPlan(opts: { source: Source; excel: string; codigosExcel: string }): LotPlan {
  const { source, excel, codigosExcel } = opts;

  if (source === 'codigos') {
    // Lotes vendidos directos: el codigoLegado ya viene embebido.
    return { lots: readSoldLotsFromCodigos(excel), source };
  }

  if (source === 'concentrado') {
    const lots = readLotsFromConcentrado(excel);
    // Cruza con "Codigos de Cliente" del mismo archivo para resolver codigoLegado.
    const idx = buildLotCodigoIndex(readCodigos(codigosExcel));
    for (const lot of lots) {
      if (lot.status === 'SOLD') {
        const code = idx.get(`${lot.manzana}-${lot.lotNumber}`);
        if (code) lot.codigoLegado = code;
      }
    }
    return { lots, source };
  }

  // template
  let idx = new Map<string, string>();
  try {
    idx = buildLotCodigoIndex(readCodigos(codigosExcel));
  } catch {
    // Sin --codigos no podremos vincular ventas; se reporta como "sin match".
  }
  const matchesContract = (m: number, l: number) => idx.has(`${m}-${l}`);
  const lots = readLotsFromTemplate(excel, { matchesContract });
  for (const lot of lots) {
    if (lot.status === 'SOLD') {
      const code = idx.get(`${lot.manzana}-${lot.lotNumber}`);
      if (code) lot.codigoLegado = code;
    }
  }
  return { lots, source };
}

// ============================================================================
// REPORTE DE COUNTS
// ============================================================================

function summarize(plan: LotPlan) {
  const byStatus: Record<string, number> = { AVAILABLE: 0, RESERVED: 0, SOLD: 0, UNAVAILABLE: 0 };
  let soldWithCode = 0;
  let soldNoCode = 0;
  for (const lot of plan.lots) {
    byStatus[lot.status] = (byStatus[lot.status] || 0) + 1;
    if (lot.status === 'SOLD') {
      if (lot.codigoLegado) soldWithCode++;
      else soldNoCode++;
    }
  }
  return { byStatus, soldWithCode, soldNoCode, total: plan.lots.length };
}

// ============================================================================
// DRY-RUN
// ============================================================================

function runDryRun(plan: LotPlan, label: string, excel: string) {
  const s = summarize(plan);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`DRY-RUN LOTES — ${label}  (source: ${plan.source})`);
  console.log(`Excel: ${path.resolve(excel)}`);
  console.log('='.repeat(70));
  console.log(`Lotes a crear (total)          : ${s.total}`);
  console.log(`  AVAILABLE                    : ${s.byStatus.AVAILABLE}`);
  console.log(`  SOLD                         : ${s.byStatus.SOLD}`);
  console.log(`  RESERVED                     : ${s.byStatus.RESERVED}`);
  console.log(`  UNAVAILABLE                  : ${s.byStatus.UNAVAILABLE}`);
  console.log(`Vendidos que se vincularían    : ${s.soldWithCode}  (empatan un código de cliente)`);
  console.log(`Vendidos SIN match a contrato  : ${s.soldNoCode}  (no se podrá crear ContractLot)`);

  if (s.soldNoCode > 0) {
    const sample = plan.lots
      .filter((l) => l.status === 'SOLD' && !l.codigoLegado)
      .slice(0, 20);
    console.log(`\n── VENDIDOS SIN CÓDIGO (muestra) ──`);
    for (const l of sample) {
      console.log(`  ⚠ M${l.manzana}-L${l.lotNumber}${l.clientName ? ` (${l.clientName})` : ''}`);
    }
  }
  console.log('\n(DRY-RUN — no se escribió NADA a la base de datos. Usa --confirm para crear.)\n');
  return s;
}

// ============================================================================
// RESOLVER PROYECTO (solo lectura; no crea proyectos)
// ============================================================================

async function resolveProjectId(opts: { projectId?: string; code?: string; project?: string }): Promise<string> {
  if (opts.projectId) {
    const p = await prisma.project.findUnique({ where: { id: opts.projectId } });
    if (!p) throw new Error(`Proyecto con id ${opts.projectId} no existe`);
    return p.id;
  }
  const p = await prisma.project.findFirst({
    where: {
      OR: [
        opts.code ? { code: opts.code } : undefined,
        opts.project ? { name: { equals: opts.project, mode: 'insensitive' } } : undefined,
        opts.project ? { name: { contains: opts.project, mode: 'insensitive' } } : undefined,
      ].filter(Boolean) as any,
    },
  });
  if (!p) {
    throw new Error(
      `No se encontró el proyecto (project="${opts.project}" code="${opts.code}"). ` +
        `Córrelo después de migrar el proyecto, o usa --projectId.`
    );
  }
  return p.id;
}

// ============================================================================
// ESCRITURA (--confirm)
// ============================================================================

async function runWrite(plan: LotPlan, projectId: string) {
  console.log(`\nEscribiendo lotes para proyecto ${projectId} (source: ${plan.source})...`);

  // 1) Cargar lotes y contratos existentes (idempotencia + linking).
  const existingLots = await prisma.lot.findMany({
    where: { projectId },
    select: { id: true, manzana: true, lotNumber: true },
  });
  const lotIndex = new Map(existingLots.map((l) => [`${l.manzana}-${l.lotNumber}`, l.id]));

  const contracts = await prisma.contract.findMany({
    where: { projectId },
    select: { id: true, codigoLegado: true, totalPrice: true },
  });
  const contractByCode = new Map(
    contracts.filter((c) => c.codigoLegado).map((c) => [c.codigoLegado!.toUpperCase(), c])
  );

  const existingLinks = await prisma.contractLot.findMany({
    where: { contract: { projectId } },
    select: { contractId: true, lotId: true },
  });
  const linkSet = new Set(existingLinks.map((l) => `${l.contractId}::${l.lotId}`));

  // Cuántos lotes vendidos cuelga cada código (para repartir precio del contrato).
  const lotsPerCode = new Map<string, number>();
  for (const lot of plan.lots) {
    if (lot.status === 'SOLD' && lot.codigoLegado) {
      lotsPerCode.set(lot.codigoLegado.toUpperCase(), (lotsPerCode.get(lot.codigoLegado.toUpperCase()) || 0) + 1);
    }
  }

  let lotsCreated = 0;
  let lotsExisting = 0;
  let linksCreated = 0;
  let linksExisting = 0;
  let linksNoContract = 0;

  for (const lot of plan.lots) {
    const key = `${lot.manzana}-${lot.lotNumber}`;
    let lotId = lotIndex.get(key);

    if (!lotId) {
      const created = await prisma.lot.create({
        data: {
          projectId,
          manzana: lot.manzana,
          lotNumber: lot.lotNumber,
          areaM2: lot.areaM2,
          basePrice: lot.basePrice,
          currentPrice: lot.currentPrice,
          status: lot.status as LotStatus,
        },
      });
      lotId = created.id;
      lotIndex.set(key, lotId);
      lotsCreated++;
    } else {
      lotsExisting++;
    }

    // Vincular vendidos a su contrato.
    if (lot.status === 'SOLD' && lot.codigoLegado) {
      const contract = contractByCode.get(lot.codigoLegado.toUpperCase());
      if (!contract) {
        linksNoContract++;
        continue;
      }
      const linkKey = `${contract.id}::${lotId}`;
      if (linkSet.has(linkKey)) {
        linksExisting++;
        continue;
      }
      const count = lotsPerCode.get(lot.codigoLegado.toUpperCase()) || 1;
      const priceAtSale = Math.round((contract.totalPrice / count) * 100) / 100;
      await prisma.contractLot.create({
        data: { contractId: contract.id, lotId, priceAtSale },
      });
      linkSet.add(linkKey);
      linksCreated++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Lotes creados        : ${lotsCreated}`);
  console.log(`Lotes ya existían    : ${lotsExisting}`);
  console.log(`Vínculos creados     : ${linksCreated}`);
  console.log(`Vínculos ya existían : ${linksExisting}`);
  console.log(`Vendidos sin contrato: ${linksNoContract}`);
  console.log('='.repeat(60));
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const source = getArg('--source') as Source | undefined;
  const excel = getArg('--excel');
  const codigosExcel = getArg('--codigos') || excel;
  const projectName = getArg('--project');
  const code = getArg('--code');
  const projectId = getArg('--projectId');
  const confirm = args.includes('--confirm');

  if (!source || !['codigos', 'concentrado', 'template'].includes(source)) {
    console.error('Falta --source <codigos|concentrado|template>.');
    process.exit(1);
  }
  if (!excel) {
    console.error('Falta --excel <ruta-al-xlsx>.');
    process.exit(1);
  }

  try {
    const plan = buildPlan({ source, excel, codigosExcel: codigosExcel! });

    if (!confirm) {
      const label = projectName || code || projectId || path.basename(excel);
      runDryRun(plan, label, excel);
      await prisma.$disconnect();
      process.exit(0);
    }

    const resolvedId = await resolveProjectId({ projectId, code, project: projectName });
    await runWrite(plan, resolvedId);
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error('migrate-lots falló:', (err as Error).message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
