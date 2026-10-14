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
// Si no hay un pago de enganche por exactamente ese monto, pero sí UNO que
// cubre enganche + sobrante, ese pago se parte en dos (misma fecha, método y
// corte): el enganche correcto y el sobrante como mensualidad. Caso: D093
// ($75,000 -> $50,000 + $25,000) y D094 ($80,000 -> $50,000 + $30,000).
//
// Si el plazo capturado también estaba mal, se corrige en la misma edición con
// --plazo=N (D073 tenía 27; el real es 48, como D093 y D094, y lo confirma su
// mensualidad: $225,000 / 48 = $4,688).
//
//   npx tsx src/scripts/enganche-sobrante-a-mensualidad.ts D073 50000 100000 --plazo=48            (dry-run)
//   npx tsx src/scripts/enganche-sobrante-a-mensualidad.ts D073 50000 100000 --plazo=48 --aplicar
//   npx tsx src/scripts/enganche-sobrante-a-mensualidad.ts D093 50000 25000            (parte el de $75,000)
import { PrismaClient, PaymentType, PaymentStatus } from '@prisma/client';
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
      id: true, clientId: true, totalPrice: true, downPayment: true, financingAmount: true, installmentAmount: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });
  const enganches = await prisma.payment.findMany({
    where: { contractId: c.id, status: 'CONFIRMED', paymentType: PaymentType.DOWN_PAYMENT },
    select: { id: true, paymentNumber: true, amount: true, paymentDate: true, concept: true, paymentMethod: true, corteId: true, corteDiarioId: true }, orderBy: { paymentDate: 'asc' },
  });
  const total = enganches.reduce((s, p) => s + p.amount, 0);
  if (Math.abs(total - monto - enganche) > 0.5) {
    throw new Error(`${CODIGO} tiene ${$(total)} de enganches pagados; no cuadra con ${$(enganche)} + ${$(monto)}`);
  }
  const pago = enganches.find(p => Math.abs(p.amount - monto) < 0.5);
  const partir = !pago && enganches.length === 1 ? enganches[0] : null;
  if (!pago && !partir) throw new Error(`${CODIGO} no tiene un pago de enganche por ${$(monto)} ni uno solo que partir`);

  console.log(`${CODIGO} ${c.client.firstName} ${c.client.lastName}`);
  const nota = 'Reclasificado: era enganche de lotes que el contrato cedió; cuenta como mensualidades.';
  if (pago) {
    console.log(`   pago del ${pago.paymentDate.toISOString().slice(0, 10)} por ${$(pago.amount)} ("${pago.concept}"): DOWN_PAYMENT -> INSTALLMENT`);
    if (aplicar) await prisma.payment.update({ where: { id: pago.id }, data: { paymentType: PaymentType.INSTALLMENT, notes: nota } });
  } else {
    console.log(`   pago del ${partir!.paymentDate.toISOString().slice(0, 10)} por ${$(partir!.amount)} ("${partir!.concept}") se parte: ` +
                `${$(enganche)} enganche + ${$(monto)} mensualidad`);
    if (aplicar) {
      const o = partir!;
      await prisma.$transaction([
        prisma.payment.update({ where: { id: o.id }, data: { amount: enganche } }),
        prisma.payment.create({
          data: {
            paymentNumber: `${o.paymentNumber}-M`,
            contractId: c.id, clientId: c.clientId,
            // Hereda el corte del original: ese dinero ya se reportó al dueño.
            corteId: o.corteId, corteDiarioId: o.corteDiarioId,
            paymentType: PaymentType.INSTALLMENT, paymentMethod: o.paymentMethod,
            amount: monto, paymentDate: o.paymentDate, concept: o.concept,
            status: PaymentStatus.CONFIRMED, notes: `Separado de su enganche de ${$(o.amount)}. ${nota}`,
          },
        }),
      ]);
    }
  }

  const r = await editarDatosDelContrato(c.id, {
    downPayment: enganche,
    ...(Number.isInteger(PLAZO) && PLAZO > 0 && { installmentCount: PLAZO }),
    motivo: (partir
      ? `Recibió su lote por traspaso y su enganche es de ${$(enganche)}; lo que sobraba (${$(monto)}) pasa a mensualidades `
      : `Cedió lotes y su enganche seguía contando el de los lotes que ya no tiene. Queda en ${$(enganche)} ` +
        `y el pago de ${$(monto)} pasa a mensualidades `) +
            `(pedido del arquitecto, ${new Date().toISOString().slice(0, 10)}).` +
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
