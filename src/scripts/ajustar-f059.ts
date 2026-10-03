// F059 Dorian Ignacio Prado: tenía M6-L4 y M6-L5, separó las cuentas y se
// quedó con el lote 5. Su enganche de $60,000 eran dos de $30,000, uno por
// lote. El del lote 4 deja de ser enganche y pasa a abonar mensualidades: el
// dinero se le respeta, pero ya no corresponde a un lote que no tiene.
//
// Con eso lo financiado sube de $289,788 a $319,788 y su mensualidad queda en
// $5,330 — que es justo lo que pedía el archivo de revisión del equipo y no se
// había podido aplicar porque, con el enganche de los dos lotes, esa
// mensualidad liquidaba lo financiado antes de las 60 cuotas.
//
//   npx tsx src/scripts/ajustar-f059.ts            (dry-run)
//   npx tsx src/scripts/ajustar-f059.ts --aplicar
import { PrismaClient, PaymentType, PaymentStatus } from '@prisma/client';
import { editarDatosDelContrato } from '../services/contratoEdicion.service';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const $ = (n: unknown) => `$${Number(n).toLocaleString('es-MX')}`;

/** El lote que soltó: su enganche es el que deja de serlo. */
const LOTE_QUE_SOLTO = 'Lote 4';

async function main() {
  console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada se escribe) ===\n');

  const c = await prisma.contract.findFirstOrThrow({
    where: { codigoLegado: 'F059' },
    select: {
      id: true, totalPrice: true, downPayment: true, balance: true,
      installmentAmount: true, installmentCount: true,
      client: { select: { firstName: true, lastName: true } },
      lots: { select: { lot: { select: { manzana: true, lotNumber: true } } } },
    },
  });

  const { _sum } = await prisma.payment.aggregate({
    where: { contractId: c.id, status: PaymentStatus.CONFIRMED }, _sum: { amount: true },
  });
  const pagado = Number(_sum.amount ?? 0);
  const saldoCorrecto = Number(c.totalPrice) - pagado;

  console.log(`F059 ${c.client.firstName} ${c.client.lastName}`);
  console.log(`   conserva ${c.lots.map(l => `M${l.lot.manzana}-L${l.lot.lotNumber}`).join(', ')} | precio ${$(c.totalPrice)}`);
  console.log(`   enganche ${$(c.downPayment)} | mensualidad ${$(c.installmentAmount ?? 0)} × ${c.installmentCount}\n`);

  // El enganche del lote que soltó: se reconoce por su propio concepto.
  const delLoteSuelto = await prisma.payment.findFirst({
    where: {
      contractId: c.id, paymentType: PaymentType.DOWN_PAYMENT,
      status: PaymentStatus.CONFIRMED, concept: { contains: LOTE_QUE_SOLTO },
    },
    select: { id: true, amount: true, paymentDate: true, concept: true },
  });
  if (!delLoteSuelto) throw new Error(`No se encontró el enganche del ${LOTE_QUE_SOLTO}`);

  const engancheQueQueda = Number(c.downPayment) - Number(delLoteSuelto.amount);

  console.log(`   enganche del ${delLoteSuelto.paymentDate.toISOString().slice(0, 10)} por ${$(delLoteSuelto.amount)} ("${delLoteSuelto.concept}")`);
  console.log(`      -> pasa a abonar mensualidades`);
  console.log(`   el enganche del contrato queda en ${$(engancheQueQueda)}\n`);

  if (aplicar) {
    await prisma.payment.update({
      where: { id: delLoteSuelto.id },
      data: {
        paymentType: PaymentType.EXTRA_PAYMENT,
        notes: `Era el enganche del ${LOTE_QUE_SOLTO}, que soltó al separar las cuentas. El dinero se le respeta y abona a sus mensualidades.`,
      },
    });
  }

  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true } });
  const r = await editarDatosDelContrato(c.id, {
    downPayment: engancheQueQueda,
    motivo: `Separó las cuentas y se quedó con el lote 5. El enganche del lote 4 (${$(delLoteSuelto.amount)}) deja de ser enganche y abona sus mensualidades: el dinero se le respeta, pero ya no corresponde a un lote que no tiene.`,
  }, admin.id, { dryRun: !aplicar });

  r.cambios
    .filter(x => !['balance', 'moraMonthsCount'].includes(x.campo))
    .forEach(x => console.log(`   ${x.campo}: ${x.valorAnterior} -> ${x.valorNuevo}`));
  console.log(`   mora ${r.moraAntes} -> ${r.moraDespues}`);

  if (aplicar) {
    const act = await prisma.contract.findUniqueOrThrow({
      where: { id: c.id }, select: { balance: true, installmentAmount: true, downPayment: true },
    });
    const ok = Math.abs(saldoCorrecto - Number(act.balance)) < 0.01;
    const cu = await prisma.cuota.findFirst({
      where: { contractId: c.id, status: 'PAGADA' }, orderBy: { numeroCuota: 'desc' },
      select: { numeroCuota: true, mes: true },
    });
    console.log(`\n   enganche ${$(act.downPayment)} | mensualidad ${$(act.installmentAmount ?? 0)}`);
    console.log(`   invariante: ${$(c.totalPrice)} - ${$(pagado)} = ${$(saldoCorrecto)} | saldo ${$(act.balance)} ${ok ? 'OK' : '<-- DESCUADRE'}`);
    console.log(`   cubierto hasta la cuota #${cu?.numeroCuota ?? 0} ${cu?.mes ?? ''}`);
  } else {
    console.log(`\n   el saldo no se mueve: ${$(saldoCorrecto)} (no entra ni sale dinero)`);
    console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
