// Lo contrario de `reponer-enganches.ts`: un contrato que quedó con MÁS
// enganche del que le toca, porque cedió lotes y su enganche siguió contando
// el de los lotes que ya no tiene.
//
// Caso que lo originó: D073 (JSA 4) tenía M4-L20, L21 y L22 con $150,000 de
// enganche; cedió dos lotes (a D093 y D094) y se quedó con M4-L22, cuyo
// enganche es $50,000. El pago de $100,000 que cubría los lotes 21 y 22 pasa a
// contar como mensualidades.
//
// No entra ni sale dinero: el saldo no se mueve. Baja el enganche, sube el
// financiado y la mora se recalcula con ese pago ya aplicado a las cuotas.
//
// Si el plazo capturado también estaba mal, se corrige en la misma edición con
// --plazo=N (D073 tenía 27; el real es 48, como D093 y D094, y lo confirma su
// mensualidad: $225,000 / 48 = $4,688).
//
//   npx tsx src/scripts/enganche-sobrante-a-mensualidad.ts D073 50000 100000 --plazo=48            (dry-run)
//   npx tsx src/scripts/enganche-sobrante-a-mensualidad.ts D073 50000 100000 --plazo=48 --aplicar
import { PrismaClient, PaymentType } from '@prisma/client';
import { editarDatosDelContrato } from '../services/contratoEdicion.service';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const [CODIGO, ENGANCHE, MONTO] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const PLAZO = Number(process.argv.find(a => a.startsWith('--plazo='))?.split('=')[1] ?? NaN);
const $ = (n: unknown) => `$${Number(n).toLocaleString('es-MX')}`;

async function main() {
  const enganche = Number(ENGANCHE), monto = Number(MONTO);
  if (!CODIGO || !(enganche >= 0) || !(monto > 0)) {
    throw new Error('Uso: enganche-sobrante-a-mensualidad.ts <CODIGO> <ENGANCHE_CORRECTO> <MONTO_DEL_PAGO> [--aplicar]');
  }
  console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada se escribe) ===\n');
  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });

  const c = await prisma.contract.findFirstOrThrow({
    where: { codigoLegado: CODIGO },
    select: {
      id: true, totalPrice: true, downPayment: true, financingAmount: true, installmentAmount: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });
  const enganches = await prisma.payment.findMany({
    where: { contractId: c.id, status: 'CONFIRMED', paymentType: PaymentType.DOWN_PAYMENT },
    select: { id: true, amount: true, paymentDate: true, concept: true }, orderBy: { paymentDate: 'asc' },
  });
  const pago = enganches.find(p => Math.abs(p.amount - monto) < 0.5);
  if (!pago) throw new Error(`${CODIGO} no tiene un pago de enganche por ${$(monto)}`);
  const quedan = enganches.filter(p => p !== pago).reduce((s, p) => s + p.amount, 0);
  if (Math.abs(quedan - enganche) > 0.5) {
    throw new Error(`Después de mover el pago, los enganches pagados suman ${$(quedan)} y no ${$(enganche)}; revisa los montos`);
  }

  console.log(`${CODIGO} ${c.client.firstName} ${c.client.lastName}`);
  console.log(`   pago del ${pago.paymentDate.toISOString().slice(0, 10)} por ${$(pago.amount)} ("${pago.concept}"): DOWN_PAYMENT -> INSTALLMENT`);

  if (aplicar) {
    await prisma.payment.update({
      where: { id: pago.id },
      data: {
        paymentType: PaymentType.INSTALLMENT,
        notes: 'Reclasificado: era enganche de lotes que el contrato cedió; cuenta como mensualidades.',
      },
    });
  }

  const r = await editarDatosDelContrato(c.id, {
    downPayment: enganche,
    ...(Number.isInteger(PLAZO) && PLAZO > 0 && { installmentCount: PLAZO }),
    motivo: `Cedió lotes y su enganche seguía contando el de los lotes que ya no tiene. Queda en ${$(enganche)} ` +
            `y el pago de ${$(monto)} pasa a mensualidades (pedido del arquitecto, 2026-10-13).` +
            (Number.isInteger(PLAZO) ? ` Plazo corregido a ${PLAZO} meses.` : ''),
  }, admin.id, { dryRun: !aplicar });

  r.cambios
    .filter(x => !['balance', 'moraMonthsCount'].includes(x.campo))
    .forEach(x => console.log(`   ${x.campo}: ${x.valorAnterior} -> ${x.valorNuevo}`));
  console.log(`   mora ${r.moraAntes} -> ${r.moraDespues}`);

  if (aplicar) {
    const { _sum } = await prisma.payment.aggregate({ where: { contractId: c.id, status: 'CONFIRMED' }, _sum: { amount: true } });
    const act = await prisma.contract.findUniqueOrThrow({ where: { id: c.id }, select: { balance: true, installmentAmount: true, downPayment: true, financingAmount: true } });
    const saldoReal = Number(c.totalPrice) - Number(_sum.amount ?? 0);
    const ok = Math.abs(saldoReal - Number(act.balance)) < 0.01;
    console.log(`   quedó: enganche ${$(act.downPayment)} · financiado ${$(act.financingAmount)} · mensualidad ${$(act.installmentAmount ?? 0)}`);
    console.log(`   invariante: saldo ${$(act.balance)} ${ok ? 'OK (no se movió)' : `<-- DESCUADRE, se esperaba ${$(saldoReal)}`}`);
  } else {
    console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)');
  }
}

main().catch(e => { console.error('❌', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
