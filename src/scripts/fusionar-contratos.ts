/**
 * fusionar-contratos.ts
 *
 * Une dos contratos que en realidad son uno. Caso real: un cliente compró dos
 * lotes y el sistema viejo le abrió un código por lote (H112 y H113), cobrando
 * una mensualidad por cada uno. El archivo consolidado los unificó, y la app ya
 * le asignó AMBOS lotes y el precio completo al destino — pero los pagos del
 * segundo lote se quedaron colgando del origen, así que al cliente le aparece
 * un saldo más alto del que realmente debe.
 *
 * Qué hace:
 *   1. Pasa los pagos del origen al destino (y a su cliente).
 *   2. Suma los enganches: si dio uno por lote, el enganche del contrato unido
 *      es la suma, y lo financiado baja en la misma medida.
 *   3. Rehace el calendario del destino con el financiamiento correcto y vuelve
 *      a aplicar TODOS los pagos en orden de fecha.
 *   4. Cierra el origen (CANCELED, saldo 0, sin calendario) y deja la nota.
 *
 * El calendario se rehace desde cero a propósito: los dos contratos tenían
 * mensualidades distintas ($7,084 y $3,542) y conservar el del destino dejaría
 * cuotas que nunca correspondieron al contrato unido.
 *
 * Uso:
 *   npx tsx src/scripts/fusionar-contratos.ts SAN H113 H112            # dry-run
 *   npx tsx src/scripts/fusionar-contratos.ts SAN H113 H112 --confirm
 */
import { PrismaClient } from '@prisma/client';
import { buildScheduleFromInstallment } from '../services/lib/installmentSchedule';
import { buildCuotaRows } from '../services/lib/cuotaSchedule';
import { aplicarPagoACuotas } from '../services/lib/pagoCuotas';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();
const [PROYECTO, ORIGEN, DESTINO] = process.argv.slice(2);
const CONFIRM = process.argv.includes('--confirm');
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const SELECT = {
  id: true, codigoLegado: true, clientId: true, status: true, startDate: true,
  totalPrice: true, downPayment: true, financingAmount: true, installmentAmount: true, balance: true, notes: true,
  client: { select: { firstName: true, lastName: true, phone: true } },
  lots: { select: { lot: { select: { manzana: true, lotNumber: true } } } },
  payments: {
    where: { status: 'CONFIRMED' as const },
    select: { id: true, amount: true, paymentDate: true, paymentType: true },
    orderBy: { paymentDate: 'asc' as const },
  },
  cuotas: { select: { id: true } },
};

async function main() {
  if (!PROYECTO || !ORIGEN || !DESTINO) throw new Error('Uso: fusionar-contratos.ts <PROYECTO> <ORIGEN> <DESTINO> [--confirm]');

  const [org, dst] = await Promise.all([
    prisma.contract.findFirst({ where: { project: { code: PROYECTO }, codigoLegado: ORIGEN }, select: SELECT }),
    prisma.contract.findFirst({ where: { project: { code: PROYECTO }, codigoLegado: DESTINO }, select: SELECT }),
  ]);
  if (!org) throw new Error(`No existe ${ORIGEN} en ${PROYECTO}`);
  if (!dst) throw new Error(`No existe ${DESTINO} en ${PROYECTO}`);
  if (!dst.startDate) throw new Error(`${DESTINO} no tiene fecha de inicio: no se puede rehacer su calendario`);
  if (!dst.installmentAmount) throw new Error(`${DESTINO} no tiene mensualidad`);

  // Guardas: fusionar dos contratos distintos borraría una venta real.
  const mismoTel = org.client.phone && org.client.phone === dst.client.phone;
  const mismoNombre = `${org.client.firstName} ${org.client.lastName}`.toLowerCase().trim()
                   === `${dst.client.firstName} ${dst.client.lastName}`.toLowerCase().trim();
  if (!mismoNombre && !mismoTel) throw new Error('Origen y destino no parecen la misma persona (ni nombre ni teléfono coinciden)');
  if (org.lots.length > 0) throw new Error(`${ORIGEN} todavía tiene lotes asignados — muévelos antes de fusionar`);

  const engancheOrg = round2(org.payments.filter(p => p.paymentType === 'DOWN_PAYMENT').reduce((s, p) => s + p.amount, 0));
  const nuevoEnganche = round2((dst.downPayment ?? 0) + engancheOrg);
  const nuevoFinanciado = round2((dst.totalPrice ?? 0) - nuevoEnganche);
  const todos = [...dst.payments, ...org.payments].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime());
  const pagadoTotal = round2(todos.reduce((s, p) => s + p.amount, 0));
  const nuevoBalance = round2((dst.totalPrice ?? 0) - pagadoTotal);

  const plan = buildScheduleFromInstallment(nuevoFinanciado, dst.installmentAmount);

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · fusionar ${ORIGEN} → ${DESTINO} (${PROYECTO})\n`);
  console.log(`   cliente:  ${dst.client.firstName} ${dst.client.lastName}  tel ${dst.client.phone ?? '—'}`);
  console.log(`   lotes del destino: ${dst.lots.map(l => `M${l.lot.manzana}-L${l.lot.lotNumber}`).join(', ')}`);
  console.log(`\n   ${''.padEnd(14)}${'ANTES'.padStart(14)} ${'DESPUÉS'.padStart(14)}`);
  console.log(`   precio        ${money(dst.totalPrice ?? 0).padStart(14)} ${money(dst.totalPrice ?? 0).padStart(14)}`);
  console.log(`   enganche      ${money(dst.downPayment ?? 0).padStart(14)} ${money(nuevoEnganche).padStart(14)}  (+${money(engancheOrg)} del ${ORIGEN})`);
  console.log(`   financiado    ${money(dst.financingAmount ?? 0).padStart(14)} ${money(nuevoFinanciado).padStart(14)}`);
  console.log(`   pagos         ${String(dst.payments.length).padStart(14)} ${String(todos.length).padStart(14)}`);
  console.log(`   pagado        ${money(round2(dst.payments.reduce((s, p) => s + p.amount, 0))).padStart(14)} ${money(pagadoTotal).padStart(14)}`);
  console.log(`   SALDO         ${money(dst.balance ?? 0).padStart(14)} ${money(nuevoBalance).padStart(14)}  ← le baja ${money(round2((dst.balance ?? 0) - nuevoBalance))}`);
  console.log(`   cuotas        ${String(dst.cuotas.length).padStart(14)} ${String(plan.cuotaAmounts.length).padStart(14)}  de ${money(dst.installmentAmount)}`);
  console.log(`\n   ${ORIGEN} queda CANCELED, saldo $0, sin calendario (${org.cuotas.length} cuotas se eliminan)`);

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  await prisma.$transaction(async tx => {
    await tx.payment.updateMany({
      where: { id: { in: org.payments.map(p => p.id) } },
      data: { contractId: dst.id, clientId: dst.clientId },
    });

    await tx.cuota.deleteMany({ where: { contractId: { in: [org.id, dst.id] } } });
    const filas = buildCuotaRows({
      contractId: dst.id, startDate: dst.startDate!, cuotaAmounts: plan.cuotaAmounts,
    });
    await tx.cuota.createMany({ data: filas });

    // Se reaplica la cascada en orden de fecha, igual que si los pagos siempre
    // hubieran entrado a un solo contrato. El enganche no abona a cuotas.
    const estado = filas.map(f => ({ id: f.id, montoEsperado: f.montoEsperado, montoPagado: 0, status: 'PENDIENTE' as 'PENDIENTE' | 'PAGADA' }));
    for (const p of todos) {
      if (p.paymentType === 'DOWN_PAYMENT') continue;
      const { updates } = aplicarPagoACuotas(p.amount, p.paymentDate, estado);
      for (const u of updates) {
        const e = estado.find(x => x.id === u.id)!;
        e.montoPagado = u.montoPagado; e.status = u.status;
        await tx.cuota.update({
          where: { id: u.id },
          data: {
            montoPagado: round2(u.montoPagado),
            status: u.status === 'PAGADA' ? 'PAGADA' : 'PENDIENTE',
            ...(u.status === 'PAGADA' ? { fechaPago: p.paymentDate } : {}),
          },
        });
      }
    }

    await tx.contract.update({
      where: { id: dst.id },
      data: {
        downPayment: nuevoEnganche, financingAmount: nuevoFinanciado, balance: nuevoBalance,
        notes: [dst.notes, `Absorbe ${ORIGEN}: el cliente compró sus lotes con un código por lote en el sistema anterior.`].filter(Boolean).join(' · '),
      },
    });

    await tx.contract.update({
      where: { id: org.id },
      data: {
        status: 'CANCELED', balance: 0, moraMonthsCount: 0,
        notes: [org.notes, `Fusionado en ${DESTINO}: era el mismo cliente y la misma compra, partida en dos códigos.`].filter(Boolean).join(' · '),
      },
    });
  });

  console.log(`\n✅ ${ORIGEN} fusionado en ${DESTINO}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
