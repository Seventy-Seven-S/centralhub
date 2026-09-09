/**
 * set-mensualidad-exacta.ts
 *
 * Fija la mensualidad EXACTA de un contrato (la del archivo que armaron las
 * secretarias desde los contratos firmados) y regenera su calendario a partir
 * de ella: el plazo se deriva, y la última cuota absorbe el residuo.
 *
 * Es lo contrario del generador normal, que parte del plazo y divide. Aquí el
 * dato duro es el monto, porque es lo que el cliente tiene en su papel.
 *
 * NO toca totalPrice, downPayment, financingAmount ni balance: solo la
 * mensualidad, el plazo derivado y las cuotas. Lo ya abonado se pre-aplica en
 * cascada, así el calendario nace cuadrado con el balance.
 *
 * Uso:
 *   npx tsx src/scripts/set-mensualidad-exacta.ts D073 4688            # dry-run
 *   npx tsx src/scripts/set-mensualidad-exacta.ts D073 4688 --confirm
 */
import { PrismaClient } from '@prisma/client';
import { buildScheduleFromInstallment } from '../services/lib/installmentSchedule';
import { buildCuotaRows } from '../services/lib/cuotaSchedule';
import { aplicarPagoACuotas } from '../services/lib/pagoCuotas';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();

const [codigo, montoArg] = process.argv.slice(2);
const CONFIRM = process.argv.includes('--confirm');
const mensualidad = Number(montoArg);

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

async function main() {
  if (!codigo || !Number.isFinite(mensualidad) || mensualidad <= 0) {
    throw new Error('Uso: set-mensualidad-exacta.ts <CODIGO> <MENSUALIDAD> [--confirm]');
  }

  const c = await prisma.contract.findFirst({
    where: { codigoLegado: codigo },
    select: {
      id: true, codigoLegado: true, totalPrice: true, downPayment: true,
      financingAmount: true, installmentAmount: true, installmentCount: true,
      startDate: true, balance: true,
      client: { select: { firstName: true, lastName: true } },
      project: { select: { code: true } },
    },
  });
  if (!c) throw new Error(`No existe el contrato ${codigo}`);
  if (!c.startDate) throw new Error(`${codigo} no tiene fecha de inicio`);

  const schedule = buildScheduleFromInstallment(c.financingAmount, mensualidad);
  const rows = buildCuotaRows({
    contractId: c.id, startDate: c.startDate, cuotaAmounts: schedule.cuotaAmounts,
  });

  // Lo ya abonado al financiamiento, en cascada, para que el calendario nazca
  // cuadrado con el balance del contrato.
  const historico = round2(c.financingAmount - (c.balance ?? c.financingAmount));
  if (historico > 0) {
    const { updates } = aplicarPagoACuotas(historico, c.startDate, rows);
    for (const u of updates) {
      const row = rows.find(r => r.id === u.id)!;
      row.montoPagado = round2(u.montoPagado);
      row.status = u.status;
    }
  }

  const pagadas = rows.filter(r => r.status === 'PAGADA').length;
  const pendiente = round2(rows.reduce((a, r) => a + r.montoEsperado - r.montoPagado, 0));

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN (usa --confirm para escribir)'}\n`);
  console.log(`${c.project.code} ${c.codigoLegado} · ${c.client.firstName} ${c.client.lastName}`);
  console.log(`  Precio total ....... ${money(c.totalPrice)}`);
  console.log(`  Enganche ........... ${money(c.downPayment)}`);
  console.log(`  Financiado ......... ${money(c.financingAmount)}`);
  console.log(`  Balance ............ ${money(c.balance ?? 0)}`);
  console.log(`\n  ANTES:   mensualidad ${money(c.installmentAmount ?? 0)} × ${c.installmentCount} cuotas`);
  console.log(`  DESPUÉS: mensualidad ${money(schedule.installmentAmount)} × ${rows.length} cuotas`);
  console.log(`           última cuota ${money(rows[rows.length - 1].montoEsperado)} (absorbe el residuo)`);
  console.log(`\n  Histórico pre-aplicado: ${money(historico)} → ${pagadas} cuotas quedan PAGADAS`);
  console.log(`  Pendiente del calendario: ${money(pendiente)}`);
  console.log(`  Balance del contrato:     ${money(c.balance ?? 0)}`);
  console.log(`  ${Math.abs(pendiente - (c.balance ?? 0)) < 1 ? '✅ CUADRA' : '❌ NO CUADRA — abortar'}`);

  if (Math.abs(pendiente - (c.balance ?? 0)) >= 1) {
    throw new Error('El calendario no cuadra con el balance — no se escribe nada');
  }
  if (!CONFIRM) {
    console.log('\nNada escrito. Repite con --confirm.\n');
    return;
  }

  await prisma.$transaction(async tx => {
    await tx.cuota.deleteMany({ where: { contractId: c.id } });
    await tx.cuota.createMany({ data: rows });
    await tx.contract.update({
      where: { id: c.id },
      data: { installmentAmount: schedule.installmentAmount, installmentCount: rows.length },
    });
  });

  console.log(`\n✅ ${codigo}: ${rows.length} cuotas reescritas, mensualidad ${money(schedule.installmentAmount)}\n`);
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
