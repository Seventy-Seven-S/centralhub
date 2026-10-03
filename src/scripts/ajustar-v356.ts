// V356 Mario Alberto García: tenía dos lotes y traspasó el 22, llevándose
// $26,000 de su dinero. Quedaron dos cosas sin ajustar.
//
//   1. Su SALDO nunca se recalculó tras el traspaso: dice $158,000 cuando
//      debe $184,000. El movimiento de −$26,000 está registrado, pero el
//      saldo siguió calculado como si ese dinero nunca hubiera salido.
//
//   2. Su ENGANCHE son $20,000 en dos pagos de $10,000, uno por lote. Al irse
//      el lote 22, a este contrato le corresponde la mitad. Con $10,000 de
//      enganche, los 60 meses dan $4,000 exactos — lo que paga cada mes.
//
// El segundo pago de enganche NO se borra: pasa a ser un abono. El dinero
// sigue siendo suyo y sigue contando contra su saldo, solo deja de ser
// enganche de un lote que ya no tiene.
//
//   npx tsx src/scripts/ajustar-v356.ts            (dry-run)
//   npx tsx src/scripts/ajustar-v356.ts --aplicar
import { PrismaClient, PaymentType, PaymentStatus } from '@prisma/client';
import { editarDatosDelContrato } from '../services/contratoEdicion.service';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const $ = (n: unknown) => `$${Number(n).toLocaleString('es-MX')}`;

const ENGANCHE_QUE_LE_TOCA = 10000;

async function main() {
  console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada se escribe) ===\n');

  const c = await prisma.contract.findFirstOrThrow({
    where: { codigoLegado: 'V356' },
    select: {
      id: true, totalPrice: true, downPayment: true, balance: true,
      installmentAmount: true, installmentCount: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });

  const { _sum } = await prisma.payment.aggregate({
    where: { contractId: c.id, status: PaymentStatus.CONFIRMED }, _sum: { amount: true },
  });
  const pagado = Number(_sum.amount ?? 0);
  const saldoCorrecto = Number(c.totalPrice) - pagado;

  console.log(`V356 ${c.client.firstName} ${c.client.lastName}`);
  console.log(`   precio ${$(c.totalPrice)} | enganche ${$(c.downPayment)} | mensualidad ${$(c.installmentAmount ?? 0)} × ${c.installmentCount}`);
  console.log(`   lo pagado (ya descontado el traspaso) ${$(pagado)}`);
  console.log(`   saldo guardado ${$(c.balance)} | debería ser ${$(saldoCorrecto)} | diferencia ${$(saldoCorrecto - Number(c.balance))}\n`);

  // El enganche del lote que se fue pasa a ser un abono: el dinero sigue
  // siendo del cliente, solo deja de ser enganche de un lote que ya no tiene.
  const enganches = await prisma.payment.findMany({
    where: { contractId: c.id, paymentType: PaymentType.DOWN_PAYMENT, status: PaymentStatus.CONFIRMED },
    orderBy: { paymentDate: 'asc' },
    select: { id: true, amount: true, paymentDate: true },
  });
  const sobrante = enganches.slice(1);   // el primero se queda como enganche

  for (const e of sobrante) {
    console.log(`   enganche del ${e.paymentDate.toISOString().slice(0, 10)} por ${$(e.amount)} -> pasa a abono`);
    if (aplicar) {
      await prisma.payment.update({
        where: { id: e.id },
        data: {
          paymentType: PaymentType.EXTRA_PAYMENT,
          notes: 'Era el enganche del lote 22, que se traspasó. El dinero sigue siendo del cliente y abona a su saldo.',
        },
      });
    }
  }

  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true } });
  const r = await editarDatosDelContrato(c.id, {
    downPayment: ENGANCHE_QUE_LE_TOCA,
    motivo: 'Traspasó el lote 22 y su enganche de $20,000 cubría los dos lotes. A este contrato le corresponden $10,000, con lo que su mensualidad vuelve a los $4,000 que paga. De paso se recalcula el saldo, que no se había ajustado tras el traspaso.',
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
    console.log(`\n   enganche ${$(act.downPayment)} | mensualidad ${$(act.installmentAmount ?? 0)}`);
    console.log(`   invariante: ${$(c.totalPrice)} - ${$(pagado)} = ${$(saldoCorrecto)} | saldo ${$(act.balance)} ${ok ? 'OK' : '<-- DESCUADRE'}`);
  } else {
    console.log(`\n   el saldo debería quedar en ${$(saldoCorrecto)}`);
    console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
