// Tres ajustes de datos que reportó el equipo el 2026-10-01.
//
//   1. V369 → V254 (Valle del Roble). La misma clienta tenía seis lotes en dos
//      contratos; canceló el V369 y su dinero se le respeta en el V254.
//   2. G002 (Puerta del Sol). Dos mensualidades que se quedaron en el sistema
//      viejo — los recibos que las amparan no salieron de esta app.
//   3. H119 (Santander). Las primeras cuatro cuotas quedaron en $4,500 cuando
//      le tocan $4,375, así que el calendario se come su sobrepago en vez de
//      acumularlo. Se rehace el calendario.
//
//   npx tsx src/scripts/ajustes-secretarias-octubre.ts            (dry-run)
//   npx tsx src/scripts/ajustes-secretarias-octubre.ts --aplicar
import { PrismaClient, PaymentType, PaymentMethod, PaymentStatus } from '@prisma/client';
import { editarDatosDelContrato } from '../services/contratoEdicion.service';
import { round2 } from '../utils/money';
import { tipoAlTrasladar } from '../services/lib/trasladoDePagos';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const $ = (n: unknown) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Recalcula el saldo desde los pagos confirmados. El invariante de la app:
 *  saldo = precio − lo pagado. Nunca se escribe un saldo "a mano". */
async function recalcularSaldo(contractId: string, ajusteSimulado = 0) {
  const c = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId }, select: { totalPrice: true },
  });
  const { _sum } = await prisma.payment.aggregate({
    where: { contractId, status: PaymentStatus.CONFIRMED },
    _sum: { amount: true },
  });
  // En dry-run nada se escribió todavía, así que el movimiento pendiente se
  // suma aquí: si no, el seco reporta las cifras de antes y no dice nada.
  const pagado = round2(Number(_sum.amount ?? 0) + (aplicar ? 0 : ajusteSimulado));
  const saldo = round2(Number(c.totalPrice) - pagado);
  if (aplicar) await prisma.contract.update({ where: { id: contractId }, data: { balance: saldo } });
  return { pagado, saldo };
}

// ─── 1. V369 → V254 ──────────────────────────────────────────────────────────
async function moverDineroDeV369() {
  console.log('1) V369 → V254  (Angela Fabiola Pérez — canceló un contrato, su dinero pasa al otro)');

  const origen = await prisma.contract.findFirstOrThrow({
    where: { codigoLegado: 'V369' }, select: { id: true, status: true, totalPrice: true },
  });
  const destino = await prisma.contract.findFirstOrThrow({
    where: { codigoLegado: 'V254' }, select: { id: true, clientId: true, totalPrice: true, balance: true },
  });

  const pagos = await prisma.payment.findMany({
    where: { contractId: origen.id, status: PaymentStatus.CONFIRMED },
    orderBy: { paymentDate: 'asc' },
  });
  if (pagos.length === 0) { console.log('   ya no tiene pagos — el movimiento ya se hizo\n'); return; }

  const total = round2(pagos.reduce((s, p) => s + Number(p.amount), 0));
  pagos.forEach(p => console.log(`   ${p.paymentDate.toISOString().slice(0, 10)} ${$(p.amount).padStart(12)} ${p.paymentType}`));
  console.log(`   total a mover: ${$(total)}`);

  if (aplicar) {
    await prisma.$transaction(async tx => {
      for (const p of pagos) {
        await tx.payment.update({
          where: { id: p.id },
          data: {
            contractId: destino.id,
            clientId: destino.clientId,
            // Un enganche deja de ser enganche al cambiar de contrato: aquí el
            // dinero se le respeta para cubrir mensualidades.
            paymentType: tipoAlTrasladar(p.paymentType as never),
            // Se conserva el concepto original: dice de qué lotes venía el
            // dinero, y eso es justo lo que hay que poder rastrear después.
            notes: `${p.notes ? `${p.notes} — ` : ''}Trasladado del contrato V369 (cancelado) al V254 por acuerdo con la clienta, 2026-10-01`,
          },
        });
      }
    });
  }

  const o = await recalcularSaldo(origen.id, -total);
  const d = await recalcularSaldo(destino.id, +total);
  console.log(`   V369 queda con ${$(o.pagado)} pagado y saldo ${$(o.saldo)} (cancelado, cifras históricas)`);
  console.log(`   V254 queda con ${$(d.pagado)} pagado y saldo ${$(d.saldo)}\n`);
}

// ─── 2. G002: dos mensualidades del sistema viejo ────────────────────────────
async function cargarPagosDeG002() {
  console.log('2) G002 Puerta del Sol — dos mensualidades que faltaban del sistema viejo');

  const c = await prisma.contract.findFirstOrThrow({
    where: { codigoLegado: 'G002' },
    select: { id: true, clientId: true, contractNumber: true, totalPrice: true },
  });

  // Fecha y monto salen de los recibos del sistema viejo que entregó el equipo.
  const faltantes = [
    { fecha: new Date('2026-09-01T12:00:00Z'), monto: 3500, mes: 'SEPTIEMBRE' },
    { fecha: new Date('2026-09-01T12:00:00Z'), monto: 3500, mes: 'OCTUBRE' },
  ];

  for (const f of faltantes) {
    const concepto = `Manzana 11 Lote 3 (${f.mes})`;
    const ya = await prisma.payment.findFirst({
      where: { contractId: c.id, concept: concepto, status: PaymentStatus.CONFIRMED },
    });
    if (ya) { console.log(`   ${f.mes}: ya estaba registrado`); continue; }

    console.log(`   ${f.mes}: ${$(f.monto)} del ${f.fecha.toISOString().slice(0, 10)}`);
    if (!aplicar) continue;

    await prisma.payment.create({
      data: {
        paymentNumber: `${c.contractNumber}-${f.mes}-${f.fecha.getTime()}`,
        contractId: c.id, clientId: c.clientId,
        paymentType: PaymentType.INSTALLMENT, paymentMethod: PaymentMethod.CASH,
        amount: f.monto, paymentDate: f.fecha, concept: concepto,
        status: PaymentStatus.CONFIRMED,
        notes: 'Migrado del sistema viejo — recibo entregado por el equipo, 2026-10-01',
      },
    });
  }

  const pendiente = faltantes.reduce((s, f) => s + f.monto, 0);
  const r = await recalcularSaldo(c.id, pendiente);
  console.log(`   queda con ${$(r.pagado)} pagado y saldo ${$(r.saldo)} (el recibo del viejo decía $161,000.00)\n`);
}

// ─── 3. H119: rehacer el calendario ──────────────────────────────────────────
async function reconstruirCalendarioH119() {
  console.log('3) H119 Santander — sus cuotas deben ser de $4,375, no de $4,500');

  const c = await prisma.contract.findFirstOrThrow({
    where: { codigoLegado: 'H119' }, select: { id: true, installmentAmount: true },
  });
  const antes = await prisma.cuota.groupBy({
    by: ['montoEsperado'], where: { contractId: c.id }, _count: true,
  });
  antes.forEach(x => console.log(`   antes: ${x._count} cuota(s) de ${$(x.montoEsperado)}`));

  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true } });

  // Sus datos están bien; lo que no concuerda es el calendario. `forzarRecalculo`
  // lo rearma desde el propio contrato y reaplica los pagos.
  const r = await editarDatosDelContrato(c.id, {
    motivo: 'Las primeras cuatro cuotas quedaron en $4,500 cuando le corresponden $4,375, así que su sobrepago no se acumulaba. Reportado por el equipo el 2026-10-01.',
  }, admin.id, { dryRun: !aplicar, forzarRecalculo: true });

  console.log(`   mora ${r.moraAntes} → ${r.moraDespues} | saldo ${$(r.balanceAntes ?? 0)} → ${$(r.balanceDespues)}`);
  if (aplicar) {
    const despues = await prisma.cuota.groupBy({ by: ['montoEsperado'], where: { contractId: c.id }, _count: true });
    despues.forEach(x => console.log(`   ahora: ${x._count} cuota(s) de ${$(x.montoEsperado)}`));
  }
  console.log('');
}

async function main() {
  console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada se escribe) ===\n');
  await moverDineroDeV369();
  await cargarPagosDeG002();
  await reconstruirCalendarioH119();
  if (!aplicar) console.log('(dry-run: vuelve a correr con --aplicar para escribir)');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
