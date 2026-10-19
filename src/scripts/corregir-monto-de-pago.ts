// Corrige el MONTO de un pago que se capturó mal y rehace todo lo que dependía
// de él, en una sola transacción. El servicio de pagos prohíbe editar el monto
// a propósito (dejaría cuotas y saldo sin recalcular); esta es la salida
// manual, igual que corregir-pagos-mal-acreditados.ts para mover o borrar.
//
// Qué se ajusta:
//  - el pago (monto + nota de por qué),
//  - el calendario de cuotas, el saldo y la mora del contrato,
//  - el corte diario en que se entregó, si todavía no se recibe,
//  - el registro del recibo, para que el QR y la reimpresión digan el monto real.
//
// No toca un pago que ya está en una liquidación al dueño ni uno cuyo corte
// diario ya se recibió: esos montos ya se firmaron.
//
// Caso que lo originó: B007 (JSA 3), 17-oct-2026. Se registró la mensualidad
// completa de $6,000 y el recibo se mandó antes de corregirlo; la clienta solo
// dejó $3,000. María lo declaró así en su corte diario #111.
//
//   npx tsx src/scripts/corregir-monto-de-pago.ts B007 2026-10-17 6000 3000            (dry-run)
//   npx tsx src/scripts/corregir-monto-de-pago.ts B007 2026-10-17 6000 3000 --aplicar
import { PrismaClient, CuotaStatus, ContractStatus } from '@prisma/client';
import { recomponerCuotas, estadoDelContrato, CuotaEnCalendario } from '../services/lib/recomponerCuotas';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const [CODIGO, FECHA, MONTO_MAL, MONTO_BIEN] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const $ = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const mal = Number(MONTO_MAL), bien = Number(MONTO_BIEN);
  if (!CODIGO || !/^\d{4}-\d{2}-\d{2}$/.test(FECHA ?? '') || !(mal > 0) || !(bien > 0) || mal === bien) {
    throw new Error('Uso: corregir-monto-de-pago.ts <CODIGO> <AAAA-MM-DD> <MONTO_CAPTURADO> <MONTO_REAL> [--aplicar]');
  }
  console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada se escribe; los números son los que quedarán) ===\n');

  const dia = new Date(`${FECHA}T00:00:00Z`);
  const candidatos = await prisma.payment.findMany({
    where: {
      contract: { codigoLegado: CODIGO }, status: 'CONFIRMED',
      paymentDate: { gte: dia, lt: new Date(dia.getTime() + 86_400_000) },
      amount: { gte: mal - 0.005, lte: mal + 0.005 },
    },
    include: { corteDiario: true, contract: { include: { client: true } } },
  });
  if (candidatos.length === 0) {
    const ya = await prisma.payment.count({ where: { contract: { codigoLegado: CODIGO }, paymentDate: { gte: dia, lt: new Date(dia.getTime() + 86_400_000) }, amount: bien } });
    console.log(ya ? `${CODIGO}: el pago del ${FECHA} ya está en ${$(bien)} — nada que hacer` : `${CODIGO}: no hay pago de ${$(mal)} el ${FECHA}`);
    return;
  }
  if (candidatos.length > 1) throw new Error(`${CODIGO}: hay ${candidatos.length} pagos de ${$(mal)} el ${FECHA}; no sé cuál`);
  const pago = candidatos[0];
  const c = pago.contract;
  const diferencia = round2(bien - mal);

  console.log(`${CODIGO} ${c.client.firstName} ${c.client.lastName} — pago ${pago.paymentNumber} "${pago.concept}"`);
  console.log(`   monto: ${$(mal)} -> ${$(bien)}`);
  if (pago.corteId) throw new Error('El pago ya está en una liquidación al dueño; no se corrige aquí');

  // ── Calendario, saldo y mora ───────────────────────────────────────────────
  const filas = await prisma.cuota.findMany({
    where: { contractId: c.id }, orderBy: { numeroCuota: 'asc' },
    select: { id: true, numeroCuota: true, montoEsperado: true, montoPagado: true, status: true, fechaPago: true, fechaVencimiento: true },
  });
  const vencimientos = new Map(filas.map(f => [f.id, f.fechaVencimiento]));
  const pagos = (await prisma.payment.findMany({
    where: { contractId: c.id, status: 'CONFIRMED', paymentType: { in: ['INSTALLMENT', 'EXTRA_PAYMENT'] } },
    orderBy: { paymentDate: 'asc' }, select: { id: true, amount: true, paymentDate: true },
  })).map(p => (p.id === pago.id ? { ...p, amount: bien } : p));
  const r = recomponerCuotas(pagos, filas as CuotaEnCalendario[]);
  const balance = round2((c.financingAmount ?? 0) - r.totalPagado);
  if (r.sobrante > 0) throw new Error(`Sobran ${$(r.sobrante)} que no caben en el calendario`);
  const reevaluable = ([ContractStatus.ACTIVE, ContractStatus.IN_MORA, ContractStatus.COMPLETED] as ContractStatus[]).includes(c.status);
  const e = reevaluable
    ? estadoDelContrato(balance, r.cuotas.map(q => ({ status: q.status, fechaVencimiento: vencimientos.get(q.id)! })))
    : null;
  console.log(`   saldo: ${$(c.balance ?? 0)} -> ${$(balance)}`);
  console.log(`   cuotas que cambian: ${r.cambios.map(q => `#${q.numeroCuota} queda ${$(q.montoPagado)} ${q.status}`).join(', ') || 'ninguna'}`);
  if (e) console.log(`   estatus: ${c.status} (${c.moraMonthsCount} de mora) -> ${e.status} (${e.moraMonthsCount})`);

  // ── Corte diario ───────────────────────────────────────────────────────────
  const cd = pago.corteDiario;
  if (cd) {
    if (cd.status !== 'PENDIENTE_ENTREGA') throw new Error(`El corte diario #${cd.numero} ya se recibió; corrígelo desde ahí`);
    const efectivo = pago.paymentMethod === 'CASH' ? round2(cd.totalEfectivo + diferencia) : cd.totalEfectivo;
    const otros = pago.paymentMethod === 'CASH' ? cd.totalOtros : round2(cd.totalOtros + diferencia);
    console.log(`   corte diario #${cd.numero}: efectivo ${$(cd.totalEfectivo)} -> ${$(efectivo)} (declarado ${$(cd.declarado)})`);
  }

  // ── Recibo ─────────────────────────────────────────────────────────────────
  const recibo = await prisma.reciboLog.findUnique({ where: { paymentId: pago.id } });
  if (recibo) console.log(`   recibo ${recibo.folio}: ${$(recibo.montoPagado)} -> ${$(bien)} · saldo ${$(recibo.balanceDespues)} -> ${$(round2(recibo.balanceDespues - diferencia))} (correo: ${recibo.envioEstado})`);

  if (!aplicar) { console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)'); return; }

  await prisma.$transaction(async tx => {
    await tx.payment.update({
      where: { id: pago.id },
      data: {
        amount: bien,
        notes: [pago.notes, `Monto corregido de ${$(mal)} a ${$(bien)} el ${new Date().toISOString().slice(0, 10)}: se capturó la mensualidad completa y el cliente dejó ${$(bien)}.`].filter(Boolean).join(' | '),
      },
    });
    for (const q of r.cambios) {
      await tx.cuota.update({
        where: { id: q.id },
        data: { montoPagado: q.montoPagado, fechaPago: q.fechaPago, status: q.status === 'PAGADA' ? CuotaStatus.PAGADA : CuotaStatus.PENDIENTE },
      });
    }
    await tx.contract.update({
      where: { id: c.id },
      data: { balance, ...(e ? { status: ContractStatus[e.status], moraMonthsCount: e.moraMonthsCount } : {}) },
    });
    if (cd) {
      await tx.corteDiario.update({
        where: { id: cd.id },
        data: pago.paymentMethod === 'CASH'
          ? { totalEfectivo: round2(cd.totalEfectivo + diferencia) }
          : { totalOtros: round2(cd.totalOtros + diferencia) },
      });
    }
    if (recibo) {
      await tx.reciboLog.update({
        where: { id: recibo.id },
        data: { montoPagado: bien, balanceDespues: round2(recibo.balanceDespues - diferencia) },
      });
    }
  });
  const act = await prisma.contract.findUniqueOrThrow({ where: { id: c.id }, select: { balance: true, status: true, moraMonthsCount: true } });
  console.log(`\n✓ Corregido. ${CODIGO} queda con saldo ${$(act.balance ?? 0)}, ${act.status}, ${act.moraMonthsCount} meses de mora.`);
}

main().catch(e => { console.error('❌', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
