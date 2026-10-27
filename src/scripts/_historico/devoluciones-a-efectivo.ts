// Las devoluciones por cancelación se registraban como transferencia. El equipo
// pidió que todo salga en efectivo (27-oct-2026) y, desde el mismo cambio, el
// corte diario ya no las cuenta: no salen de la caja de quien cobra (Miriam
// cerraba esos cortes declarando $0) y ya se registran como gasto de
// Cancelaciones.
//
// Aquí las que ya existen quedan igual que las nuevas:
//  - método CASH,
//  - fuera del corte diario en que hubieran caído. Su "otros" se recalcula con
//    los pagos que le quedan (en #38 y #41 lo guardado ya no cuadraba con sus
//    pagos). El efectivo, lo declarado y lo recibido de ese corte no cambian.
//
// Correr DESPUÉS de desplegar el backend que las deja fuera del corte diario;
// con el código viejo, una devolución de hoy volvería a aparecer en "mi día".
//
//   npx tsx src/scripts/_historico/devoluciones-a-efectivo.ts            (dry-run)
//   npx tsx src/scripts/_historico/devoluciones-a-efectivo.ts --aplicar
import { PrismaClient } from '@prisma/client';
import { round2 } from '../../utils/money';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const $ = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada se escribe) ===\n');

  const devoluciones = await prisma.payment.findMany({
    where: { paymentType: 'RESCISSION_REFUND', OR: [{ paymentMethod: { not: 'CASH' } }, { corteDiarioId: { not: null } }] },
    orderBy: { paymentDate: 'asc' },
    select: {
      id: true, amount: true, paymentDate: true, paymentMethod: true,
      contract: { select: { codigoLegado: true } },
      corteDiario: { select: { id: true, numero: true, status: true, totalOtros: true } },
    },
  });
  if (devoluciones.length === 0) { console.log('No hay devoluciones que cambiar.'); return; }

  // Los cortes diarios de donde salen; su "otros" se recalcula abajo.
  const porCorte = new Map<string, { numero: number; status: string; otros: number; nuevo: number; pagos: number }>();
  for (const d of devoluciones) {
    console.log(`  ${d.paymentDate.toISOString().slice(0, 10)}  ${(d.contract.codigoLegado ?? '').padEnd(5)} ${$(d.amount).padStart(12)}  ${d.paymentMethod} -> CASH` +
      (d.corteDiario ? `  · sale del corte diario #${d.corteDiario.numero} (${d.corteDiario.status})` : ''));
    if (d.corteDiario && !porCorte.has(d.corteDiario.id)) {
      porCorte.set(d.corteDiario.id, { numero: d.corteDiario.numero, status: d.corteDiario.status, otros: d.corteDiario.totalOtros, nuevo: 0, pagos: 0 });
    }
  }
  for (const [id, c] of porCorte) {
    const quedan = await prisma.payment.findMany({
      where: { corteDiarioId: id, paymentType: { not: 'RESCISSION_REFUND' } },
      select: { amount: true, paymentMethod: true },
    });
    c.pagos = quedan.length;
    c.nuevo = round2(quedan.filter(p => p.paymentMethod !== 'CASH').reduce((s, p) => s + p.amount, 0));
    console.log(`  corte diario #${c.numero} (${c.status}): otros ${$(c.otros)} -> ${$(c.nuevo)}` +
      (c.pagos === 0 ? '  · se queda sin pagos (solo tenía devoluciones)' : ''));
  }

  if (!aplicar) { console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)'); return; }

  await prisma.$transaction(async tx => {
    await tx.payment.updateMany({
      where: { id: { in: devoluciones.map(d => d.id) } },
      data: { paymentMethod: 'CASH', corteDiarioId: null },
    });
    for (const [id, c] of porCorte) {
      await tx.corteDiario.update({ where: { id }, data: { totalOtros: c.nuevo } });
    }
  });
  const quedan = await prisma.payment.count({ where: { paymentType: 'RESCISSION_REFUND', OR: [{ paymentMethod: { not: 'CASH' } }, { corteDiarioId: { not: null } }] } });
  console.log(`\n✓ Listo. Devoluciones en transferencia o dentro de un corte diario: ${quedan}`);
}

main().catch(e => { console.error('❌', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
