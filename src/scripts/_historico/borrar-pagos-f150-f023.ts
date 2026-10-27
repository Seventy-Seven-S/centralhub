// Borra dos pagos que se capturaron por error (pedido de Miriam, 21-oct-2026)
// y rehace lo que dependía de ellos, cada uno en una sola transacción:
//
//  - F150: el pago de $4,200 del 16-oct ("Mensualidades #15–#16") no existió;
//    el cliente no pagó nada ese día. Su corte diario #105 sigue sin recibirse
//    y Miriam ya había declarado $4,200 menos, así que al quitarlo cuadra.
//  - F023: la "Mensualidad #18 — Septiembre" del 08-sep era el pago de otra
//    persona. No se sabe de quién; Miguel lo investiga después. Ese pago ya
//    está en la liquidación de septiembre: la liquidación guarda sus totales,
//    así que sus cifras firmadas no cambian, pero se le deja una nota.
//    Al quitarlo, el pago del 21-oct pasa a cubrir octubre (cuota #18) y su
//    concepto y su recibo se corrigen para decirlo.
//
//   npx tsx src/scripts/_historico/borrar-pagos-f150-f023.ts            (dry-run)
//   npx tsx src/scripts/_historico/borrar-pagos-f150-f023.ts --aplicar
import { PrismaClient, CuotaStatus, ContractStatus } from '@prisma/client';
import { recomponerCuotas, estadoDelContrato, CuotaEnCalendario } from '../../services/lib/recomponerCuotas';
import { round2 } from '../../utils/money';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const $ = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hoy = new Date().toISOString().slice(0, 10);

interface Caso {
  codigo: string;
  pagoId: string;
  porque: string;
  aunqueEsteLiquidado?: boolean;
  /** Pago posterior cuyo concepto y recibo cambian de cuota al quitar este. */
  renombrar?: { pagoId: string; concepto: string; numeroCuota: number; mes: string };
}

const CASOS: Caso[] = [
  {
    codigo: 'F150',
    pagoId: '1e7f63a8-6e82-46b9-b5ae-6b0ab300df80', // $4,200 del 16-oct
    porque: 'El cliente no pagó nada ese día; se capturó por error.',
  },
  {
    codigo: 'F023',
    pagoId: '61684720-dd8f-405d-868d-337d755436de', // $5,480 del 08-sep, "Mensualidad #18 — Septiembre 2026"
    porque: 'Era el pago de otra persona; se capturó en F023 por error. Pendiente saber de quién.',
    aunqueEsteLiquidado: true,
    renombrar: {
      pagoId: '4fe3d3fb-35ce-4225-ac15-04990da14085', // $5,480 del 21-oct
      concepto: 'Mensualidad #18 — octubre de 2026',
      numeroCuota: 18,
      mes: 'octubre de 2026',
    },
  },
];

async function corregir(caso: Caso) {
  const pago = await prisma.payment.findUnique({
    where: { id: caso.pagoId },
    include: { corteDiario: true, corte: true, contract: { include: { client: true } } },
  });
  if (!pago) { console.log(`\n${caso.codigo}: el pago ya no existe — nada que hacer`); return; }
  const c = pago.contract;
  if (c.codigoLegado !== caso.codigo) throw new Error(`${caso.codigo}: el pago es de ${c.codigoLegado}`);

  console.log(`\n${caso.codigo} ${c.client.firstName} ${c.client.lastName}`);
  console.log(`   borrar: ${pago.paymentNumber} ${$(pago.amount)} del ${pago.paymentDate.toISOString().slice(0, 10)} "${pago.concept}"`);
  if (pago.corte && !caso.aunqueEsteLiquidado) throw new Error('El pago ya está en una liquidación al dueño');
  if (pago.corte) console.log(`   ⚠ está en la liquidación #${pago.corte.numero} (sus totales guardados no cambian; se le agrega una nota)`);

  // ── Calendario, saldo y mora ───────────────────────────────────────────────
  const filas = await prisma.cuota.findMany({
    where: { contractId: c.id }, orderBy: { numeroCuota: 'asc' },
    select: { id: true, numeroCuota: true, montoEsperado: true, montoPagado: true, status: true, fechaPago: true, fechaVencimiento: true },
  });
  const vencimientos = new Map(filas.map(f => [f.id, f.fechaVencimiento]));
  const pagos = await prisma.payment.findMany({
    where: { contractId: c.id, status: 'CONFIRMED', paymentType: { in: ['INSTALLMENT', 'EXTRA_PAYMENT'] }, id: { not: pago.id } },
    orderBy: { paymentDate: 'asc' }, select: { amount: true, paymentDate: true },
  });
  const r = recomponerCuotas(pagos, filas as CuotaEnCalendario[]);
  if (r.sobrante > 0) throw new Error(`Sobran ${$(r.sobrante)} que no caben en el calendario`);
  const balance = round2((c.financingAmount ?? 0) - r.totalPagado);
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
    const efectivo = pago.paymentMethod === 'CASH' ? round2(cd.totalEfectivo - pago.amount) : cd.totalEfectivo;
    const otros = pago.paymentMethod === 'CASH' ? cd.totalOtros : round2(cd.totalOtros - pago.amount);
    console.log(`   corte diario #${cd.numero}: efectivo ${$(cd.totalEfectivo)} -> ${$(efectivo)}, otros ${$(cd.totalOtros)} -> ${$(otros)} (declarado ${$(cd.declarado)})`);
  }

  // ── Recibos ────────────────────────────────────────────────────────────────
  const recibo = await prisma.reciboLog.findUnique({ where: { paymentId: pago.id } });
  if (recibo) console.log(`   recibo ${recibo.folio} se borra (correo: ${recibo.envioEstado})`);

  const ren = caso.renombrar;
  const pagoRen = ren ? await prisma.payment.findUniqueOrThrow({ where: { id: ren.pagoId } }) : null;
  const reciboRen = ren ? await prisma.reciboLog.findUnique({ where: { paymentId: ren.pagoId } }) : null;
  if (ren && pagoRen) {
    console.log(`   pago del ${pagoRen.paymentDate.toISOString().slice(0, 10)}: "${pagoRen.concept}" -> "${ren.concepto}"`);
    if (reciboRen) console.log(`   su recibo ${reciboRen.folio}: cuota #${reciboRen.numeroCuota} ${reciboRen.mes} -> #${ren.numeroCuota} ${ren.mes}, saldo ${$(reciboRen.balanceDespues)} -> ${$(round2(reciboRen.balanceDespues + pago.amount))}`);
  }

  if (!aplicar) return;

  await prisma.$transaction(async tx => {
    if (recibo) await tx.reciboLog.delete({ where: { id: recibo.id } });
    await tx.payment.delete({ where: { id: pago.id } });
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
          ? { totalEfectivo: round2(cd.totalEfectivo - pago.amount) }
          : { totalOtros: round2(cd.totalOtros - pago.amount) },
      });
    }
    if (pago.corte) {
      await tx.corte.update({
        where: { id: pago.corte.id },
        data: {
          notas: [pago.corte.notas, `${hoy}: se borró el pago ${pago.paymentNumber} de ${caso.codigo} por ${$(pago.amount)} (${caso.porque}). Los totales de esta liquidación se dejaron como se firmaron.`]
            .filter(Boolean).join(' | '),
        },
      });
    }
    if (ren && pagoRen) {
      await tx.payment.update({
        where: { id: pagoRen.id },
        data: {
          concept: ren.concepto,
          notes: [pagoRen.notes, `${hoy}: concepto corregido de "${pagoRen.concept}"; se borró un pago de septiembre que no era de este cliente.`].filter(Boolean).join(' | '),
        },
      });
      if (reciboRen) {
        await tx.reciboLog.update({
          where: { id: reciboRen.id },
          data: { concepto: ren.concepto, numeroCuota: ren.numeroCuota, mes: ren.mes, balanceDespues: round2(reciboRen.balanceDespues + pago.amount) },
        });
      }
    }
  });
  const act = await prisma.contract.findUniqueOrThrow({ where: { id: c.id }, select: { balance: true, status: true, moraMonthsCount: true } });
  console.log(`   ✓ ${caso.codigo} queda con saldo ${$(act.balance ?? 0)}, ${act.status}, ${act.moraMonthsCount} meses de mora.`);
}

async function main() {
  console.log(aplicar ? '=== APLICANDO ===' : '=== DRY-RUN (nada se escribe; los números son los que quedarán) ===');
  for (const caso of CASOS) await corregir(caso);
  if (!aplicar) console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)');
}

main().catch(e => { console.error('❌', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
