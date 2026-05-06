/**
 * link-contracts-lots-monarca2.ts
 * Vincula los 91 contratos de Monarca II a sus lotes en contract_lots.
 * Lee el Excel para obtener manzana+lote por código, luego crea los registros.
 *
 * Uso: npx tsx src/scripts/link-contracts-lots-monarca2.ts
 */

import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROJECT_ID = '74b9deb6-a793-408d-8087-0e30ef0f288d';
const EXCEL_PATH = '/Users/miguelmachuca/Downloads/SISTEMA MONARCA II (1).xlsx';

// Parsea "3,4 y 5" → [3, 4, 5]
function parseLoteNumbers(loteStr: string): number[] {
  return loteStr
    .replace(/y/gi, ',')
    .split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n));
}

// Lee el Excel y construye mapa: codigoLegado → { manzana, lotes[] }
function buildCodigoMap(): Map<string, { manzana: number; lotes: number[] }> {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets['Códigos'];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

  // Detectar fila de headers
  let headerRow = -1;
  for (let i = 0; i <= 4; i++) {
    const str = (raw[i] || []).join(' ').toUpperCase();
    if (str.includes('CODIGO') || str.includes('MANZANA')) { headerRow = i; break; }
  }

  if (headerRow === -1) throw new Error('No se encontró fila de headers en hoja Códigos');

  const headers: string[] = raw[headerRow].map((h: any) => h?.toString().trim().toUpperCase());
  const codigoMap = new Map<string, { manzana: number; lotes: number[] }>();

  // Buscar índices de columnas clave
  const codigoIdx = headers.findIndex(h =>
    h.includes('CODIGO') || h.includes('CÓDIGO')
  );
  const manzanaIdx = headers.findIndex(h => h.includes('MANZANA'));
  const loteIdx = headers.findIndex(h => h === 'LOTE' || h === 'LOTE ');

  console.log(`Headers: ${headers.join(' | ')}`);
  console.log(`codigoIdx=${codigoIdx}, manzanaIdx=${manzanaIdx}, loteIdx=${loteIdx}`);

  for (let i = headerRow + 1; i < raw.length; i++) {
    const rowArr = raw[i];
    if (!rowArr || rowArr.every((c: any) => !c?.toString().trim())) continue;

    const codigo  = rowArr[codigoIdx]?.toString().trim().toUpperCase();
    const manzana = parseInt(rowArr[manzanaIdx]?.toString().trim() || '0');
    const loteStr = rowArr[loteIdx]?.toString().trim() || '';

    if (!codigo || !manzana || !loteStr) continue;

    const lotes = parseLoteNumbers(loteStr);
    if (lotes.length === 0) continue;

    codigoMap.set(codigo, { manzana, lotes });
  }

  return codigoMap;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Vinculando contratos de Monarca II → contract_lots');
  console.log('='.repeat(60));

  // 1. Leer Excel
  console.log('\n1. Leyendo Excel...');
  const codigoMap = buildCodigoMap();
  console.log(`   Códigos leídos del Excel: ${codigoMap.size}`);

  // 2. Cargar todos los lotes de Monarca II desde DB
  console.log('\n2. Cargando lotes desde DB...');
  const lots = await prisma.lot.findMany({
    where: { projectId: PROJECT_ID },
    select: { id: true, manzana: true, lotNumber: true, currentPrice: true },
  });
  // Índice: "manzana-lotNumber" → lot
  const lotIndex = new Map(lots.map(l => [`${l.manzana}-${l.lotNumber}`, l]));
  console.log(`   Lotes en DB: ${lots.length}`);

  // 3. Cargar todos los contratos de Monarca II desde DB
  console.log('\n3. Cargando contratos desde DB...');
  const contracts = await prisma.contract.findMany({
    where: { projectId: PROJECT_ID },
    select: { id: true, codigoLegado: true, totalPrice: true },
  });
  console.log(`   Contratos en DB: ${contracts.length}`);

  // 4. Verificar links existentes
  const existingLinks = await prisma.contractLot.findMany({
    where: { contract: { projectId: PROJECT_ID } },
    select: { contractId: true, lotId: true },
  });
  const existingSet = new Set(existingLinks.map(l => `${l.contractId}::${l.lotId}`));
  console.log(`   Links ya existentes: ${existingSet.size}`);

  // 5. Crear links
  console.log('\n4. Vinculando...\n');

  let created = 0;
  let skipped = 0;
  let notFound = 0;
  const errors: string[] = [];

  for (const contract of contracts) {
    const codigo = contract.codigoLegado?.trim().toUpperCase();
    if (!codigo) {
      errors.push(`Contrato ${contract.id} sin codigoLegado`);
      notFound++;
      continue;
    }

    const entry = codigoMap.get(codigo);
    if (!entry) {
      errors.push(`Código ${codigo} no encontrado en Excel`);
      notFound++;
      continue;
    }

    const { manzana, lotes } = entry;
    const pricePerLot = Math.round((contract.totalPrice / lotes.length) * 100) / 100;

    for (const loteNum of lotes) {
      const key = `${manzana}-${String(loteNum)}`;
      const lot = lotIndex.get(key);

      if (!lot) {
        errors.push(`Lote M${manzana}-L${loteNum} no encontrado en DB (código ${codigo})`);
        notFound++;
        continue;
      }

      const linkKey = `${contract.id}::${lot.id}`;
      if (existingSet.has(linkKey)) {
        skipped++;
        continue;
      }

      await prisma.contractLot.create({
        data: {
          contractId:  contract.id,
          lotId:       lot.id,
          priceAtSale: pricePerLot,
        },
      });

      existingSet.add(linkKey);
      created++;

      console.log(
        `  ✓ ${codigo.padEnd(6)} → M${String(manzana).padEnd(2)} L-${String(loteNum).padEnd(3)}` +
        `  $${pricePerLot.toLocaleString('es-MX')}`
      );
    }
  }

  // 6. Resumen
  console.log('\n' + '='.repeat(60));
  console.log(`Links creados   : ${created}`);
  console.log(`Ya existían     : ${skipped}`);
  console.log(`No encontrados  : ${notFound}`);

  if (errors.length > 0) {
    console.log('\nErrores:');
    errors.forEach(e => console.log(`  ✗ ${e}`));
  }

  // 7. Verificación final
  const totalLinks = await prisma.contractLot.count({
    where: { contract: { projectId: PROJECT_ID } },
  });
  console.log(`\nTotal links en contract_lots: ${totalLinks}`);
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
