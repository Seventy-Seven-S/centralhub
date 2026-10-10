// Compara la "Base de Lotes" nueva de Los Cisnes contra lo que está cargado.
// NO escribe nada: solo dice en qué difieren, para decidir con datos.
//
//   npx tsx src/scripts/comparar-cisnes.ts
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();
const $ = (n: unknown) => `$${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
const clave = (mz: number, lote: string | number) => `M${mz}-L${Number(lote)}`;

/** Diferencias de centavos no son cambios de precio. */
const CENTAVOS = 1;

async function main() {
  const wb = XLSX.readFile('backups/PLANO LOS CISNES.xlsx');
  const filas = XLSX.utils.sheet_to_json(wb.Sheets['Base de Lotes'], { header: 1, raw: true }) as unknown[][];
  const iH = filas.findIndex(r => String(r?.[0] ?? '').trim().toUpperCase() === 'MANZANA');

  const delArchivo = new Map<string, { m2: number; precio: number }>();
  for (const r of filas.slice(iH + 1)) {
    const mz = Number(r[0]), lote = Number(r[1]);
    if (!Number.isFinite(mz) || !Number.isFinite(lote)) continue;
    delArchivo.set(clave(mz, lote), { m2: Number(r[3]) || 0, precio: Number(r[5]) || 0 });
  }

  const proyecto = await prisma.project.findFirstOrThrow({ where: { code: 'LCS' }, select: { id: true } });
  const enSistema = await prisma.lot.findMany({
    where: { projectId: proyecto.id },
    select: {
      id: true, manzana: true, lotNumber: true, areaM2: true, currentPrice: true, status: true,
      contracts: { select: { contract: { select: { codigoLegado: true, status: true } } } },
    },
  });

  const porClave = new Map(enSistema.map(l => [clave(l.manzana, l.lotNumber), l]));

  const seVan = enSistema.filter(l => !delArchivo.has(clave(l.manzana, l.lotNumber)));
  const llegan = [...delArchivo.keys()].filter(k => !porClave.has(k));
  const cambian: string[] = [];

  for (const [k, nuevo] of delArchivo) {
    const viejo = porClave.get(k);
    if (!viejo) continue;
    const dM2 = Math.abs(viejo.areaM2 - nuevo.m2);
    const dP = Math.abs(Number(viejo.currentPrice) - nuevo.precio);
    if (dM2 > 0.01 || dP > CENTAVOS) {
      cambian.push(`${k.padEnd(10)} ${viejo.areaM2.toFixed(2).padStart(8)} m² → ${nuevo.m2.toFixed(2).padStart(8)} m²  |  ` +
        `${$(viejo.currentPrice).padStart(14)} → ${$(nuevo.precio).padStart(14)}` +
        (viejo.status !== 'AVAILABLE' ? `   <-- ${viejo.status}` : ''));
    }
  }

  console.log('LOS CISNES — archivo nuevo contra lo cargado\n');
  console.log(`   en el sistema hoy: ${enSistema.length} lotes`);
  console.log(`   en el archivo:     ${delArchivo.size} lotes\n`);

  console.log(`DESAPARECEN del archivo: ${seVan.length}`);
  const vendidos = seVan.filter(l => l.status !== 'AVAILABLE' || l.contracts.length > 0);
  for (const l of seVan.slice(0, 40)) {
    const ct = l.contracts[0]?.contract;
    console.log(`   ${clave(l.manzana, l.lotNumber).padEnd(10)} ${l.areaM2.toFixed(2).padStart(8)} m²  ${$(l.currentPrice).padStart(14)}  ${l.status}` +
      (ct ? `   <-- CONTRATO ${ct.codigoLegado} (${ct.status})` : ''));
  }
  if (seVan.length > 40) console.log(`   … y ${seVan.length - 40} más`);
  console.log(`   de esos, CON contrato o no disponibles: ${vendidos.length}`);

  console.log(`\nLLEGAN nuevos: ${llegan.length}`);
  llegan.slice(0, 15).forEach(k => {
    const n = delArchivo.get(k)!;
    console.log(`   ${k.padEnd(10)} ${n.m2.toFixed(2).padStart(8)} m²  ${$(n.precio).padStart(14)}`);
  });
  if (llegan.length > 15) console.log(`   … y ${llegan.length - 15} más`);

  console.log(`\nCAMBIAN de medida o precio: ${cambian.length}`);
  cambian.slice(0, 20).forEach(c => console.log('   ' + c));
  if (cambian.length > 20) console.log(`   … y ${cambian.length - 20} más`);

  const valorViejo = enSistema.reduce((s, l) => s + Number(l.currentPrice), 0);
  const valorNuevo = [...delArchivo.values()].reduce((s, l) => s + l.precio, 0);
  console.log(`\nvalor del proyecto: ${$(valorViejo)} → ${$(valorNuevo)}  (${$(valorNuevo - valorViejo)})`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
