/**
 * seed-lots-monarca2.ts
 * Carga los 161 lotes de Monarca II a la tabla lots.
 * Marca como SOLD los lotes que ya tienen contrato en la DB.
 *
 * Uso: npx tsx src/scripts/seed-lots-monarca2.ts
 */

import * as XLSX from 'xlsx';
import { PrismaClient, LotStatus } from '@prisma/client';

const prisma = new PrismaClient();

const PROJECT_ID   = '74b9deb6-a793-408d-8087-0e30ef0f288d';
const PRICE_PER_M2 = 1300;
const EXCEL_PATH   = '/Users/miguelmachuca/Downloads/SISTEMA MONARCA II (1).xlsx';

// ============================================================================
// DATOS DE LOS 161 LOTES (manzana, lotNumber, areaM2)
// ============================================================================

const LOTS_DATA: { manzana: number; lotNumber: string; areaM2: number }[] = [
  // Manzana 1 — 18 lotes
  { manzana: 1, lotNumber: '1',  areaM2: 212.57 },
  { manzana: 1, lotNumber: '2',  areaM2: 215.68 },
  { manzana: 1, lotNumber: '3',  areaM2: 218.79 },
  { manzana: 1, lotNumber: '4',  areaM2: 221.89 },
  { manzana: 1, lotNumber: '5',  areaM2: 225.00 },
  { manzana: 1, lotNumber: '6',  areaM2: 228.11 },
  { manzana: 1, lotNumber: '7',  areaM2: 231.21 },
  { manzana: 1, lotNumber: '8',  areaM2: 234.32 },
  { manzana: 1, lotNumber: '9',  areaM2: 318.65 },
  { manzana: 1, lotNumber: '10', areaM2: 244.03 },
  { manzana: 1, lotNumber: '11', areaM2: 200.00 },
  { manzana: 1, lotNumber: '12', areaM2: 200.00 },
  { manzana: 1, lotNumber: '13', areaM2: 200.00 },
  { manzana: 1, lotNumber: '14', areaM2: 200.00 },
  { manzana: 1, lotNumber: '15', areaM2: 200.00 },
  { manzana: 1, lotNumber: '16', areaM2: 200.00 },
  { manzana: 1, lotNumber: '17', areaM2: 200.00 },
  { manzana: 1, lotNumber: '18', areaM2: 200.00 },

  // Manzana 2 — 17 lotes
  { manzana: 2, lotNumber: '1',  areaM2: 200.00 },
  { manzana: 2, lotNumber: '2',  areaM2: 200.00 },
  { manzana: 2, lotNumber: '3',  areaM2: 200.00 },
  { manzana: 2, lotNumber: '4',  areaM2: 200.00 },
  { manzana: 2, lotNumber: '5',  areaM2: 200.00 },
  { manzana: 2, lotNumber: '6',  areaM2: 200.00 },
  { manzana: 2, lotNumber: '7',  areaM2: 200.00 },
  { manzana: 2, lotNumber: '8',  areaM2: 200.00 },
  { manzana: 2, lotNumber: '9',  areaM2: 205.66 },
  { manzana: 2, lotNumber: '10', areaM2: 384.00 },
  { manzana: 2, lotNumber: '11', areaM2: 200.00 },
  { manzana: 2, lotNumber: '12', areaM2: 200.00 },
  { manzana: 2, lotNumber: '13', areaM2: 200.00 },
  { manzana: 2, lotNumber: '14', areaM2: 200.00 },
  { manzana: 2, lotNumber: '15', areaM2: 200.00 },
  { manzana: 2, lotNumber: '16', areaM2: 200.00 },
  { manzana: 2, lotNumber: '17', areaM2: 200.00 },

  // Manzana 3 — 16 lotes
  { manzana: 3, lotNumber: '1',  areaM2: 200.00 },
  { manzana: 3, lotNumber: '2',  areaM2: 200.00 },
  { manzana: 3, lotNumber: '3',  areaM2: 200.00 },
  { manzana: 3, lotNumber: '4',  areaM2: 200.00 },
  { manzana: 3, lotNumber: '5',  areaM2: 200.00 },
  { manzana: 3, lotNumber: '6',  areaM2: 200.00 },
  { manzana: 3, lotNumber: '7',  areaM2: 200.00 },
  { manzana: 3, lotNumber: '8',  areaM2: 345.67 },
  { manzana: 3, lotNumber: '9',  areaM2: 324.05 },
  { manzana: 3, lotNumber: '10', areaM2: 200.00 },
  { manzana: 3, lotNumber: '11', areaM2: 200.00 },
  { manzana: 3, lotNumber: '12', areaM2: 200.00 },
  { manzana: 3, lotNumber: '13', areaM2: 200.00 },
  { manzana: 3, lotNumber: '14', areaM2: 200.00 },
  { manzana: 3, lotNumber: '15', areaM2: 200.00 },
  { manzana: 3, lotNumber: '16', areaM2: 200.00 },

  // Manzana 4 — 16 lotes
  { manzana: 4, lotNumber: '1',  areaM2: 200.00 },
  { manzana: 4, lotNumber: '2',  areaM2: 200.00 },
  { manzana: 4, lotNumber: '3',  areaM2: 200.00 },
  { manzana: 4, lotNumber: '4',  areaM2: 200.00 },
  { manzana: 4, lotNumber: '5',  areaM2: 200.00 },
  { manzana: 4, lotNumber: '6',  areaM2: 200.00 },
  { manzana: 4, lotNumber: '7',  areaM2: 200.00 },
  { manzana: 4, lotNumber: '8',  areaM2: 315.00 },
  { manzana: 4, lotNumber: '9',  areaM2: 357.72 },
  { manzana: 4, lotNumber: '10', areaM2: 200.00 },
  { manzana: 4, lotNumber: '11', areaM2: 200.00 },
  { manzana: 4, lotNumber: '12', areaM2: 200.00 },
  { manzana: 4, lotNumber: '13', areaM2: 200.00 },
  { manzana: 4, lotNumber: '14', areaM2: 200.00 },
  { manzana: 4, lotNumber: '15', areaM2: 200.00 },
  { manzana: 4, lotNumber: '16', areaM2: 200.00 },

  // Manzana 5 — 16 lotes
  { manzana: 5, lotNumber: '1',  areaM2: 200.00 },
  { manzana: 5, lotNumber: '2',  areaM2: 200.00 },
  { manzana: 5, lotNumber: '3',  areaM2: 200.00 },
  { manzana: 5, lotNumber: '4',  areaM2: 200.00 },
  { manzana: 5, lotNumber: '5',  areaM2: 200.00 },
  { manzana: 5, lotNumber: '6',  areaM2: 200.00 },
  { manzana: 5, lotNumber: '7',  areaM2: 200.00 },
  { manzana: 5, lotNumber: '8',  areaM2: 366.00 },
  { manzana: 5, lotNumber: '9',  areaM2: 353.16 },
  { manzana: 5, lotNumber: '10', areaM2: 200.00 },
  { manzana: 5, lotNumber: '11', areaM2: 200.00 },
  { manzana: 5, lotNumber: '12', areaM2: 200.00 },
  { manzana: 5, lotNumber: '13', areaM2: 200.00 },
  { manzana: 5, lotNumber: '14', areaM2: 200.00 },
  { manzana: 5, lotNumber: '15', areaM2: 200.00 },
  { manzana: 5, lotNumber: '16', areaM2: 200.00 },

  // Manzana 6 — 16 lotes
  { manzana: 6, lotNumber: '1',  areaM2: 200.00 },
  { manzana: 6, lotNumber: '2',  areaM2: 200.00 },
  { manzana: 6, lotNumber: '3',  areaM2: 200.00 },
  { manzana: 6, lotNumber: '4',  areaM2: 200.00 },
  { manzana: 6, lotNumber: '5',  areaM2: 200.00 },
  { manzana: 6, lotNumber: '6',  areaM2: 200.00 },
  { manzana: 6, lotNumber: '7',  areaM2: 200.00 },
  { manzana: 6, lotNumber: '8',  areaM2: 328.28 },
  { manzana: 6, lotNumber: '9',  areaM2: 245.39 },
  { manzana: 6, lotNumber: '10', areaM2: 200.00 },
  { manzana: 6, lotNumber: '11', areaM2: 200.00 },
  { manzana: 6, lotNumber: '12', areaM2: 200.00 },
  { manzana: 6, lotNumber: '13', areaM2: 200.00 },
  { manzana: 6, lotNumber: '14', areaM2: 200.00 },
  { manzana: 6, lotNumber: '15', areaM2: 200.00 },
  { manzana: 6, lotNumber: '16', areaM2: 200.00 },

  // Manzana 7 — 14 lotes
  { manzana: 7, lotNumber: '1',  areaM2: 200.00 },
  { manzana: 7, lotNumber: '2',  areaM2: 200.00 },
  { manzana: 7, lotNumber: '3',  areaM2: 200.00 },
  { manzana: 7, lotNumber: '4',  areaM2: 200.00 },
  { manzana: 7, lotNumber: '5',  areaM2: 200.00 },
  { manzana: 7, lotNumber: '6',  areaM2: 200.00 },
  { manzana: 7, lotNumber: '7',  areaM2: 276.31 },
  { manzana: 7, lotNumber: '8',  areaM2: 247.28 },
  { manzana: 7, lotNumber: '9',  areaM2: 200.00 },
  { manzana: 7, lotNumber: '10', areaM2: 200.00 },
  { manzana: 7, lotNumber: '11', areaM2: 200.00 },
  { manzana: 7, lotNumber: '12', areaM2: 200.00 },
  { manzana: 7, lotNumber: '13', areaM2: 200.00 },
  { manzana: 7, lotNumber: '14', areaM2: 200.00 },

  // Manzana 8 — 7 lotes
  { manzana: 8, lotNumber: '1', areaM2: 287.22 },
  { manzana: 8, lotNumber: '2', areaM2: 287.80 },
  { manzana: 8, lotNumber: '3', areaM2: 288.39 },
  { manzana: 8, lotNumber: '4', areaM2: 288.95 },
  { manzana: 8, lotNumber: '5', areaM2: 289.52 },
  { manzana: 8, lotNumber: '6', areaM2: 290.10 },
  { manzana: 8, lotNumber: '7', areaM2: 275.51 },

  // Manzana 9 — 41 lotes
  { manzana: 9, lotNumber: '1',  areaM2: 345.32 },
  { manzana: 9, lotNumber: '2',  areaM2: 200.00 },
  { manzana: 9, lotNumber: '3',  areaM2: 200.00 },
  { manzana: 9, lotNumber: '4',  areaM2: 200.00 },
  { manzana: 9, lotNumber: '5',  areaM2: 200.00 },
  { manzana: 9, lotNumber: '6',  areaM2: 200.00 },
  { manzana: 9, lotNumber: '7',  areaM2: 200.00 },
  { manzana: 9, lotNumber: '8',  areaM2: 200.00 },
  { manzana: 9, lotNumber: '9',  areaM2: 200.00 },
  { manzana: 9, lotNumber: '10', areaM2: 200.00 },
  { manzana: 9, lotNumber: '11', areaM2: 200.00 },
  { manzana: 9, lotNumber: '12', areaM2: 200.00 },
  { manzana: 9, lotNumber: '13', areaM2: 200.00 },
  { manzana: 9, lotNumber: '14', areaM2: 200.00 },
  { manzana: 9, lotNumber: '15', areaM2: 200.00 },
  { manzana: 9, lotNumber: '16', areaM2: 200.00 },
  { manzana: 9, lotNumber: '17', areaM2: 200.00 },
  { manzana: 9, lotNumber: '18', areaM2: 200.00 },
  { manzana: 9, lotNumber: '19', areaM2: 200.00 },
  { manzana: 9, lotNumber: '20', areaM2: 200.00 },
  { manzana: 9, lotNumber: '21', areaM2: 200.00 },
  { manzana: 9, lotNumber: '22', areaM2: 200.00 },
  { manzana: 9, lotNumber: '23', areaM2: 200.00 },
  { manzana: 9, lotNumber: '24', areaM2: 200.00 },
  { manzana: 9, lotNumber: '25', areaM2: 200.00 },
  { manzana: 9, lotNumber: '26', areaM2: 200.00 },
  { manzana: 9, lotNumber: '27', areaM2: 200.00 },
  { manzana: 9, lotNumber: '28', areaM2: 200.00 },
  { manzana: 9, lotNumber: '29', areaM2: 200.00 },
  { manzana: 9, lotNumber: '30', areaM2: 200.00 },
  { manzana: 9, lotNumber: '31', areaM2: 200.00 },
  { manzana: 9, lotNumber: '32', areaM2: 200.00 },
  { manzana: 9, lotNumber: '33', areaM2: 200.00 },
  { manzana: 9, lotNumber: '34', areaM2: 200.00 },
  { manzana: 9, lotNumber: '35', areaM2: 200.00 },
  { manzana: 9, lotNumber: '36', areaM2: 200.00 },
  { manzana: 9, lotNumber: '37', areaM2: 200.00 },
  { manzana: 9, lotNumber: '38', areaM2: 200.00 },
  { manzana: 9, lotNumber: '39', areaM2: 200.00 },
  { manzana: 9, lotNumber: '40', areaM2: 200.00 },
  { manzana: 9, lotNumber: '41', areaM2: 200.00 },
];

// ============================================================================
// HELPER: parsea lote strings del Excel → array de números
// ============================================================================

function parseLoteNumbers(loteStr: string): number[] {
  return loteStr
    .replace(/y/gi, ',')
    .split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n));
}

// ============================================================================
// LEE EL EXCEL Y CONSTRUYE SET DE LOTES VENDIDOS: "manzana-lotNumber"
// ============================================================================

function buildSoldSet(): Set<string> {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets['Códigos'];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

  let headerRow = -1;
  for (let i = 0; i <= 4; i++) {
    const str = (raw[i] || []).join(' ').toUpperCase();
    if (str.includes('CODIGO') || str.includes('MANZANA')) { headerRow = i; break; }
  }

  const headers: string[] = raw[headerRow].map((h: any) => h?.toString().trim());
  const soldSet = new Set<string>();

  for (let i = headerRow + 1; i < raw.length; i++) {
    const rowArr = raw[i];
    if (!rowArr || rowArr.every((c: any) => !c?.toString().trim())) continue;

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = rowArr[idx]?.toString().trim() ?? ''; });

    const manzana = parseInt(obj['MANZANA'] || obj['MANZANA '] || '0');
    const loteStr = obj['LOTE'] || obj['LOTE '] || '';

    if (!manzana || !loteStr) continue;

    for (const loteNum of parseLoteNumbers(loteStr)) {
      soldSet.add(`${manzana}-${loteNum}`);
    }
  }

  return soldSet;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('Leyendo Excel para determinar lotes vendidos...');
  const soldSet = buildSoldSet();
  console.log(`Lotes vendidos identificados: ${soldSet.size}`);

  console.log(`\nInsertando ${LOTS_DATA.length} lotes...\n`);

  let created = 0;
  let sold = 0;
  let available = 0;

  for (const lot of LOTS_DATA) {
    const key    = `${lot.manzana}-${parseInt(lot.lotNumber)}`;
    const status = soldSet.has(key) ? LotStatus.SOLD : LotStatus.AVAILABLE;
    const price  = Math.round(lot.areaM2 * PRICE_PER_M2 * 100) / 100;

    await prisma.lot.create({
      data: {
        projectId:    PROJECT_ID,
        manzana:      lot.manzana,
        lotNumber:    lot.lotNumber,
        areaM2:       lot.areaM2,
        basePrice:    price,
        currentPrice: price,
        status,
      },
    });

    console.log(
      `M${String(lot.manzana).padEnd(2)} L-${lot.lotNumber.padEnd(3)}` +
      ` ${String(lot.areaM2).padEnd(8)} m²` +
      `  $${price.toLocaleString('es-MX').padEnd(10)}` +
      `  ${status}`
    );

    created++;
    status === LotStatus.SOLD ? sold++ : available++;
  }

  console.log('\n========================================');
  console.log(`Total lotes creados : ${created}`);
  console.log(`  SOLD              : ${sold}`);
  console.log(`  AVAILABLE         : ${available}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
