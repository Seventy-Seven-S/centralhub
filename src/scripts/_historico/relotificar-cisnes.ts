/**
 * Relotificación de Los Cisnes por el área verde: deja los lotes del proyecto
 * exactamente como la hoja "Base de Lotes" de `backups/PLANO LOS CISNES.xlsx`.
 *
 *  - Lotes que siguen: se actualizan medida, precio y ubicación.
 *  - Lotes nuevos del archivo: se crean disponibles.
 *  - Lotes que ya no existen: se borran. Solo si están AVAILABLE y sin
 *    contrato; si alguno no cumple, no se escribe NADA.
 *
 * Precios redondeados a pesos, como el resto del proyecto. M1-L1 (contrato
 * LCS001) queda en $490,000: es lo que firmó el cliente y lo que pide el
 * archivo ($490,000.52 por redondeo de su precio por m²). El sistema tenía
 * 340.24 m² / $365,758, que nunca fue lo vendido.
 *
 *   npx tsx src/scripts/_historico/relotificar-cisnes.ts            # solo muestra
 *   npx tsx src/scripts/_historico/relotificar-cisnes.ts --confirm  # escribe
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');
const clave = (mz: number, lote: string | number) => `M${mz}-L${Number(lote)}`;
const $ = (n: number) => `$${n.toLocaleString('es-MX')}`;

/** Precio pactado en contrato que manda sobre el redondeo del archivo. */
const PRECIO_FIRMADO: Record<string, number> = { 'M1-L1': 490000 };

async function main() {
  const wb = XLSX.readFile('backups/PLANO LOS CISNES.xlsx');
  const filas = XLSX.utils.sheet_to_json(wb.Sheets['Base de Lotes'], { header: 1, raw: true }) as unknown[][];
  const iH = filas.findIndex(r => String(r?.[0] ?? '').trim().toUpperCase() === 'MANZANA');

  const archivo = new Map<string, { manzana: number; lote: number; m2: number; precio: number; ubicacion: string }>();
  for (const r of filas.slice(iH + 1)) {
    const manzana = Number(r[0]), lote = Number(r[1]);
    if (!Number.isFinite(manzana) || !Number.isFinite(lote)) continue;
    const k = clave(manzana, lote);
    if (archivo.has(k)) throw new Error(`Lote repetido en el archivo: ${k}`);
    const m2 = Math.round(Number(r[3]) * 100) / 100;
    const precio = PRECIO_FIRMADO[k] ?? Math.round(Number(r[5]));
    if (!(m2 > 0) || !(precio > 0)) throw new Error(`Medida o precio inválido en ${k}`);
    archivo.set(k, { manzana, lote, m2, precio, ubicacion: String(r[2] ?? '').trim().toUpperCase() });
  }

  const proyecto = await prisma.project.findFirstOrThrow({ where: { code: 'LCS' }, select: { id: true } });
  const lotes = await prisma.lot.findMany({
    where: { projectId: proyecto.id },
    select: {
      id: true, manzana: true, lotNumber: true, areaM2: true, basePrice: true, currentPrice: true, status: true, features: true,
      contracts: { select: { id: true, priceAtSale: true, contract: { select: { codigoLegado: true, totalPrice: true } } } },
    },
  });
  const sistema = new Map(lotes.map(l => [clave(l.manzana, l.lotNumber), l]));

  const borrar = lotes.filter(l => !archivo.has(clave(l.manzana, l.lotNumber)));
  const bloqueados = borrar.filter(l => l.status !== 'AVAILABLE' || l.contracts.length > 0);
  if (bloqueados.length) {
    console.log('✗ No se escribe nada. Estos lotes desaparecen del archivo pero tienen contrato o no están disponibles:');
    bloqueados.forEach(l => console.log(`   ${clave(l.manzana, l.lotNumber)} ${l.status} ${l.contracts.map(c => c.contract.codigoLegado).join(',')}`));
    process.exitCode = 1;
    return;
  }

  const crear = [...archivo.entries()].filter(([k]) => !sistema.has(k)).map(([, a]) => a);
  const actualizar = [...archivo.entries()].flatMap(([k, a]) => {
    const l = sistema.get(k);
    if (!l) return [];
    const ubicacionActual = (l.features as any)?.ubicacion ?? '';
    const cambia = Math.abs(l.areaM2 - a.m2) > 0.001 || l.basePrice !== a.precio || l.currentPrice !== a.precio || ubicacionActual !== a.ubicacion;
    return cambia ? [{ l, a, k }] : [];
  });

  // Lotes vendidos cuyo precio de venta registrado no coincide con el nuevo.
  const ventas = actualizar.flatMap(({ l, a, k }) => l.contracts
    .filter(c => c.priceAtSale !== a.precio)
    .map(c => ({ id: c.id, k, codigo: c.contract.codigoLegado, antes: c.priceAtSale, despues: a.precio, totalContrato: c.contract.totalPrice })));

  console.log('LOS CISNES — relotificación\n');
  console.log(`  hoy: ${lotes.length} lotes  →  archivo: ${archivo.size} lotes`);
  console.log(`  se borran: ${borrar.length} (todos disponibles y sin contrato)`);
  console.log(`  se crean:  ${crear.length}`);
  console.log(`  cambian:   ${actualizar.length}`);
  for (const v of ventas) console.log(`  venta ${v.codigo} ${v.k}: precio de venta ${$(v.antes)} → ${$(v.despues)} (contrato firmado por ${$(v.totalContrato)})`);
  const vendidos = actualizar.filter(x => x.l.status !== 'AVAILABLE');
  for (const { l, a, k } of vendidos) console.log(`  ${l.status} ${k}: ${l.areaM2} m² ${$(l.currentPrice)} → ${a.m2} m² ${$(a.precio)}`);
  const valorAntes = lotes.reduce((s, l) => s + l.currentPrice, 0);
  const valorDespues = [...archivo.values()].reduce((s, a) => s + a.precio, 0);
  console.log(`  valor del proyecto: ${$(valorAntes)} → ${$(valorDespues)}\n`);

  if (!CONFIRM) { console.log('Nada escrito. Repite con --confirm.'); return; }

  await prisma.$transaction(async tx => {
    if (borrar.length) await tx.lot.deleteMany({ where: { id: { in: borrar.map(l => l.id) }, status: 'AVAILABLE', contracts: { none: {} } } });
    for (const { l, a } of actualizar) {
      await tx.lot.update({
        where: { id: l.id },
        data: { areaM2: a.m2, basePrice: a.precio, currentPrice: a.precio, features: { ...((l.features as object) ?? {}), ubicacion: a.ubicacion } },
      });
    }
    if (crear.length) {
      await tx.lot.createMany({
        data: crear.map(a => ({
          projectId: proyecto.id, manzana: a.manzana, lotNumber: String(a.lote), areaM2: a.m2,
          basePrice: a.precio, currentPrice: a.precio, status: 'AVAILABLE' as const, features: { ubicacion: a.ubicacion },
        })),
      });
    }
    for (const v of ventas) await tx.contractLot.update({ where: { id: v.id }, data: { priceAtSale: v.despues } });
    const total = await tx.lot.count({ where: { projectId: proyecto.id } });
    if (total !== archivo.size) throw new Error(`Quedaron ${total} lotes y el archivo tiene ${archivo.size}; se deshace todo`);
  }, { timeout: 120000 });

  console.log(`✓ Los Cisnes quedó con ${archivo.size} lotes, igual que el archivo.`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
