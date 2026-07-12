import { PrismaClient, CuotaStatus, ContractStatus } from '@prisma/client';
import { aplicarPagoACuotas, CuotaLike } from '../services/lib/pagoCuotas';

const prisma = new PrismaClient();

// Reconcilia pagos INSTALLMENT contra el calendario de cuotas de TODOS los
// proyectos (antes estaba fijo a Monarca II). Idempotente: recalcula el estado
// de cada cuota desde cero en cada corrida. Excluye contratos CANCELED (no se
// les debe reescribir el status). Opcional: pasar `--code XXX` para un solo
// proyecto.
//
// `--include-extra`: además de INSTALLMENT, drena EXTRA_PAYMENT al calendario.
// Necesario para JSA: los ajustes históricos tipo "Otro" (mensualidades 2022
// que solo existían agregadas en el Excel) entran como EXTRA_PAYMENT y sí son
// dinero que cubre cuotas — sin esto quedarían contratos en mora falsa.
// El enganche (DOWN_PAYMENT) nunca entra: las cuotas ya lo excluyen.

// ── Lógica de saldo acumulado ─────────────────────────────────────────────────
// Pool = remanente de pagos aún no asignado a ninguna cuota.
// Cada pago suma al pool; el pool se drena cuota por cuota en orden.
// Si el pool no alcanza para cerrar la cuota actual, ésta queda PENDIENTE con
// el monto parcial y el pool llega a 0. El próximo pago continúa desde ahí.

interface CuotaUpdate {
  id:          string;
  montoPagado: number;
  fechaPago:   Date;
  status:      CuotaStatus;
}

function calcularUpdates(
  pagos:  Array<{ id: string; amount: number; paymentDate: Date }>,
  cuotas: Array<{ id: string; montoEsperado: number; numeroCuota: number }>,
): CuotaUpdate[] {
  // Estado desde cero (el script SIEMPRE recalcula todo el contrato).
  const estado: Array<CuotaLike & { fechaPago: Date | null }> = cuotas.map(c => ({
    id: c.id, montoEsperado: c.montoEsperado, montoPagado: 0, status: 'PENDIENTE', fechaPago: null,
  }));

  for (const pago of pagos) {
    const updates = aplicarPagoACuotas(pago.amount, pago.paymentDate, estado);
    for (const u of updates) {
      const e = estado.find(x => x.id === u.id)!;
      e.montoPagado = u.montoPagado;
      e.status      = u.status;
      e.fechaPago   = u.fechaPago;
    }
  }

  return estado
    .filter(e => e.montoPagado > 0 && e.fechaPago)
    .map(e => ({
      id: e.id,
      montoPagado: e.montoPagado,
      fechaPago: e.fechaPago!,
      status: e.status === 'PAGADA' ? CuotaStatus.PAGADA : CuotaStatus.PENDIENTE,
    }));
}

// ── Procesar un contrato ──────────────────────────────────────────────────────

async function procesarContrato(
  contractId: string,
  codigo: string,
  includeExtra: boolean,
): Promise<{ pagadas: number; parciales: number }> {
  const tipos: Array<'INSTALLMENT' | 'EXTRA_PAYMENT'> = includeExtra
    ? ['INSTALLMENT', 'EXTRA_PAYMENT']
    : ['INSTALLMENT'];
  const pagos = await prisma.payment.findMany({
    where:   { contractId, paymentType: { in: tipos } },
    orderBy: { paymentDate: 'asc' },
    select:  { id: true, amount: true, paymentDate: true },
  });

  const cuotas = await prisma.cuota.findMany({
    where:   { contractId },
    orderBy: { numeroCuota: 'asc' },
    select:  { id: true, montoEsperado: true, numeroCuota: true },
  });

  if (pagos.length === 0) {
    console.log(`  ${codigo} — sin pagos INSTALLMENT, omitido`);
    return { pagadas: 0, parciales: 0 };
  }

  const updates = calcularUpdates(pagos, cuotas);

  if (updates.length === 0) {
    console.log(`  ${codigo} — sin cambios`);
    return { pagadas: 0, parciales: 0 };
  }

  await prisma.$transaction(
    updates.map(u =>
      prisma.cuota.update({
        where: { id: u.id },
        data:  { montoPagado: u.montoPagado, fechaPago: u.fechaPago, status: u.status },
      })
    )
  );

  const hoy      = new Date();
  const vencidas = await prisma.cuota.count({
    where: { contractId, status: CuotaStatus.PENDIENTE, fechaVencimiento: { lt: hoy } },
  });
  await prisma.contract.update({
    where: { id: contractId },
    data:  {
      moraMonthsCount: vencidas,
      status: vencidas > 0 ? ContractStatus.IN_MORA : ContractStatus.ACTIVE,
    },
  });

  const pagadas   = updates.filter(u => u.status === CuotaStatus.PAGADA).length;
  const parciales = updates.filter(u => u.status === CuotaStatus.PENDIENTE).length;
  console.log(`  ${codigo} — ${pagadas} PAGADAS | ${parciales} parcial | mora: ${vencidas}`);
  return { pagadas, parciales };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Filtro opcional por proyecto: --code XXX
  const args = process.argv.slice(2);
  const codeIdx = args.indexOf('--code');
  const onlyCode = codeIdx !== -1 ? args[codeIdx + 1] : undefined;
  const includeExtra = args.includes('--include-extra');

  const projectWhere = onlyCode ? { code: onlyCode } : {};
  const projects = await prisma.project.findMany({
    where:   projectWhere,
    select:  { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });

  if (projects.length === 0) {
    console.error(onlyCode ? `No existe proyecto con code=${onlyCode}` : 'No hay proyectos');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`Reconciliando pagos→cuotas — ${projects.length} proyecto(s)\n`);

  let totalPagadas = 0, totalParciales = 0, totalContratos = 0;
  for (const proj of projects) {
    const contratos = await prisma.contract.findMany({
      where:   { projectId: proj.id, status: { not: ContractStatus.CANCELED } },
      select:  { id: true, codigoLegado: true },
      orderBy: { codigoLegado: 'asc' },
    });
    if (contratos.length === 0) continue;

    console.log(`\n=== ${proj.code} — ${proj.name} (${contratos.length} contratos) ===`);
    let projPagadas = 0, projParciales = 0;
    for (const c of contratos) {
      const r = await procesarContrato(c.id, c.codigoLegado ?? c.id, includeExtra);
      projPagadas   += r.pagadas;
      projParciales += r.parciales;
    }
    console.log(`  → ${proj.code}: ${projPagadas} cuotas PAGADAS, ${projParciales} parciales`);
    totalPagadas   += projPagadas;
    totalParciales += projParciales;
    totalContratos += contratos.length;
  }

  console.log('\n════════════════════════════════════');
  console.log(`Contratos procesados   : ${totalContratos}`);
  console.log(`Total cuotas PAGADAS   : ${totalPagadas}`);
  console.log(`Total cuotas parciales : ${totalParciales}`);
  console.log('════════════════════════════════════');

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
