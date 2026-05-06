import { PrismaClient, CuotaStatus, ContractStatus } from '@prisma/client';

const prisma = new PrismaClient();
const PROJECT_ID = '74b9deb6-a793-408d-8087-0e30ef0f288d';

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
  const estado = new Map<string, { pagado: number; fechaPago: Date | null }>();
  for (const c of cuotas) estado.set(c.id, { pagado: 0, fechaPago: null });

  let cuotaIdx = 0;

  for (const pago of pagos) {
    let pool = pago.amount;

    while (pool > 0 && cuotaIdx < cuotas.length) {
      const cuota  = cuotas[cuotaIdx];
      const est    = estado.get(cuota.id)!;
      const needed = cuota.montoEsperado - est.pagado;

      if (pool >= needed) {
        est.pagado    = cuota.montoEsperado;
        est.fechaPago = pago.paymentDate;
        pool         -= needed;
        cuotaIdx++;
      } else {
        est.pagado   += pool;
        est.fechaPago = pago.paymentDate;
        pool          = 0;
      }
    }

    if (cuotaIdx >= cuotas.length) break;
  }

  const updates: CuotaUpdate[] = [];
  for (const cuota of cuotas) {
    const est = estado.get(cuota.id)!;
    if (est.pagado > 0 && est.fechaPago) {
      updates.push({
        id:          cuota.id,
        montoPagado: est.pagado,
        fechaPago:   est.fechaPago,
        status:      est.pagado >= cuota.montoEsperado
                     ? CuotaStatus.PAGADA
                     : CuotaStatus.PENDIENTE,
      });
    }
  }
  return updates;
}

// ── Procesar un contrato ──────────────────────────────────────────────────────

async function procesarContrato(
  contractId: string,
  codigo: string,
): Promise<{ pagadas: number; parciales: number }> {
  const pagos = await prisma.payment.findMany({
    where:   { contractId, paymentType: 'INSTALLMENT' },
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
  const contratos = await prisma.contract.findMany({
    where:   { projectId: PROJECT_ID },
    select:  { id: true, codigoLegado: true },
    orderBy: { codigoLegado: 'asc' },
  });

  console.log(`Aplicando pagos a cuotas — ${contratos.length} contratos\n`);

  let totalPagadas = 0, totalParciales = 0;
  for (const c of contratos) {
    const r = await procesarContrato(c.id, c.codigoLegado ?? c.id);
    totalPagadas   += r.pagadas;
    totalParciales += r.parciales;
  }

  console.log('\n════════════════════════════════════');
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
