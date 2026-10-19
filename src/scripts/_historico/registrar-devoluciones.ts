// Registra las devoluciones que el equipo confirmó en el archivo
// "devoluciones-por-confirmar.xlsx".
//
// El sistema mostraba $1.9M de dinero retenido, pero esa cifra solo significaba
// "no hay registro de devolución": 32 de los 41 casos venían de la migración y
// nadie había capturado si al cliente se le regresó algo. El equipo revisó caso
// por caso y resultó que sí se devolvieron $326,809.
//
// La devolución se guarda como un pago NEGATIVO de tipo RESCISSION_REFUND, que
// es como ya lo hace la rescisión desde la app (contract.service). Así el
// dinero retenido se deriva solo y no hay un contador que mantener.
//
//   npx tsx src/scripts/_historico/registrar-devoluciones.ts            (dry-run)
//   npx tsx src/scripts/_historico/registrar-devoluciones.ts --aplicar
import { PrismaClient, PaymentType, PaymentMethod, PaymentStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { round2 } from '../../utils/money';

const prisma = new PrismaClient();
const ARCHIVO = 'backups/devoluciones-por-confirmar.xlsx';
const pesos = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Devolucion { codigo: string; cliente: string; monto: number; fecha: Date; nota: string | null }

function leer(): { devoluciones: Devolucion[]; sinDevolucion: number; problemas: string[] } {
  // cellDates: sin esto las fechas llegan como texto en formato americano
  // ("3/26/26") y se interpretan al revés — día y mes cambiados.
  const wb = XLSX.readFile(ARCHIVO, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];
  const iH = filas.findIndex(f => String(f?.[0] ?? '').trim().toUpperCase() === 'PROYECTO');

  const devoluciones: Devolucion[] = [];
  const problemas: string[] = [];
  let sinDevolucion = 0;

  for (const f of filas.slice(iH + 1)) {
    const codigo = String(f?.[1] ?? '').trim().toUpperCase();
    if (!codigo || codigo === 'X000') continue;   // la fila de ejemplo

    const monto = typeof f[7] === 'number' ? f[7] : Number(String(f[7] ?? '').replace(/[$,\s]/g, ''));
    if (!Number.isFinite(monto) || monto <= 0) { sinDevolucion++; continue; }

    const celda = f[8];
    if (!(celda instanceof Date) || Number.isNaN(celda.getTime())) {
      problemas.push(`${codigo}: devolución de ${pesos(monto)} sin fecha usable ("${String(celda ?? '')}")`);
      continue;
    }
    // Se ancla a mediodía UTC para que el día no se corra por zona horaria.
    const fecha = new Date(Date.UTC(celda.getFullYear(), celda.getMonth(), celda.getDate(), 12));
    devoluciones.push({ codigo, cliente: String(f[2] ?? '').trim(), monto: round2(monto), fecha, nota: (f[10] as string) ?? null });
  }
  return { devoluciones, sinDevolucion, problemas };
}

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  console.log(aplicar ? '=== APLICANDO ===' : '=== DRY-RUN (nada se escribe) ===\n');

  const { devoluciones, sinDevolucion, problemas } = leer();
  let nuevas = 0, yaEstaban = 0, sinContrato = 0, total = 0;

  for (const d of devoluciones) {
    const c = await prisma.contract.findFirst({
      where: { codigoLegado: d.codigo },
      select: { id: true, clientId: true, contractNumber: true, totalPrice: true },
    });
    if (!c) { sinContrato++; problemas.push(`${d.codigo}: no existe en la base`); continue; }

    // Idempotente: si ya hay una devolución por ese monto, no se duplica.
    const ya = await prisma.payment.findFirst({
      where: {
        contractId: c.id, paymentType: PaymentType.RESCISSION_REFUND,
        amount: { gte: -d.monto - 0.5, lte: -d.monto + 0.5 },
      },
    });
    if (ya) { yaEstaban++; continue; }

    console.log(`${aplicar ? '✓' : '·'} ${d.codigo.padEnd(6)} ${d.cliente.slice(0, 30).padEnd(32)} ` +
      `${pesos(d.monto).padStart(14)} el ${d.fecha.toISOString().slice(0, 10)}`);
    nuevas++; total = round2(total + d.monto);

    if (!aplicar) continue;

    await prisma.payment.create({
      data: {
        // Negativo, igual que la devolución que registra la app al rescindir.
        paymentNumber: `${c.contractNumber}-DEV-${d.fecha.getTime()}`,
        contractId: c.id,
        clientId: c.clientId,
        paymentType: PaymentType.RESCISSION_REFUND,
        paymentMethod: PaymentMethod.CASH,
        amount: -d.monto,
        paymentDate: d.fecha,
        concept: 'Devolución al cliente por cancelación del contrato',
        status: PaymentStatus.CONFIRMED,
        notes: `Confirmada por el equipo en la revisión de septiembre 2026${d.nota ? ` — ${d.nota}` : ''}`,
      },
    });
  }

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  ${aplicar ? 'registradas' : 'por registrar'}: ${nuevas}  ${pesos(total)}`);
  console.log(`  ya estaban en el sistema:  ${yaEstaban}`);
  console.log(`  sin devolución (el equipo dijo que no): ${sinDevolucion}`);
  console.log(`  contratos no encontrados:  ${sinContrato}`);
  if (problemas.length) {
    console.log(`\nPor revisar a mano (${problemas.length}):`);
    problemas.forEach(p => console.log(`   ${p}`));
  }
  if (!aplicar) console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
