import { PrismaClient, CuotaStatus, ContractStatus } from '@prisma/client';
import { aplicarPagoACuotas, CuotaLike } from '../services/lib/pagoCuotas';
import { round2 } from '../utils/money';

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
//
// `--dry-run`: calcula y reporta todo, no escribe nada.
//
// `--exclude-today`: excluye del replay los pagos con paymentDate de HOY —
// para corridas de backfill histórico, no queremos que un pago recién
// registrado en vivo (que ya corrió por el cascade real de
// registrarPagoMensualidad) se mezcle con el recálculo retroactivo.
//
// Balance: recalcula contract.balance = financingAmount − Σ(montoPagado de
// TODAS las cuotas tras el recálculo) — antes este script solo tocaba
// `cuotas` y dejaba `balance` desfasado.
//
// Salvaguarda: si una cuota YA está PAGADA en la BD, el recálculo nunca la
// regresa a PENDIENTE ni le baja el montoPagado — solo puede avanzar hacia
// adelante. Si el recálculo (con los pagos incluidos) produce algo "menor"
// para una cuota ya PAGADA, se conserva el estado actual de esa cuota y se
// reporta como advertencia para revisión manual — nunca se escribe un
// downgrade silencioso.

interface CuotaUpdate {
  id:          string;
  montoPagado: number;
  fechaPago:   Date;
  status:      CuotaStatus;
}

interface CuotaActual {
  id: string; numeroCuota: number; montoEsperado: number; montoPagado: number; status: CuotaStatus;
}

function calcularUpdates(
  pagos:  Array<{ id: string; amount: number; paymentDate: Date }>,
  cuotas: CuotaActual[],
): { updates: CuotaUpdate[]; downgrades: Array<{ numeroCuota: number }> } {
  // Estado desde cero (el script SIEMPRE recalcula todo el contrato).
  const estado: Array<CuotaLike & { fechaPago: Date | null; numeroCuota: number }> = cuotas.map(c => ({
    id: c.id, montoEsperado: c.montoEsperado, montoPagado: 0, status: 'PENDIENTE', fechaPago: null,
    numeroCuota: c.numeroCuota,
  }));

  for (const pago of pagos) {
    const { updates } = aplicarPagoACuotas(pago.amount, pago.paymentDate, estado);
    for (const u of updates) {
      const e = estado.find(x => x.id === u.id)!;
      e.montoPagado = u.montoPagado;
      e.status      = u.status;
      e.fechaPago   = u.fechaPago;
    }
  }

  const downgrades: Array<{ numeroCuota: number }> = [];
  const updates: CuotaUpdate[] = [];

  for (const e of estado) {
    const actual = cuotas.find(c => c.id === e.id)!;

    // Salvaguarda anti-downgrade: nunca tocar una cuota ya PAGADA si el
    // recálculo la deja peor (PENDIENTE o con menos monto).
    if (actual.status === CuotaStatus.PAGADA) {
      const recalculoEsMenor = e.status !== 'PAGADA' || round2(e.montoPagado) < round2(actual.montoPagado);
      if (recalculoEsMenor) {
        downgrades.push({ numeroCuota: actual.numeroCuota });
        continue; // no se toca esta cuota
      }
    }

    if (!e.fechaPago || e.montoPagado <= 0) continue;
    const nuevoStatus = e.status === 'PAGADA' ? CuotaStatus.PAGADA : CuotaStatus.PENDIENTE;
    const cambioMonto = round2(e.montoPagado) !== round2(actual.montoPagado);
    const cambioStatus = nuevoStatus !== actual.status;
    if (!cambioMonto && !cambioStatus) continue;

    updates.push({ id: e.id, montoPagado: round2(e.montoPagado), fechaPago: e.fechaPago, status: nuevoStatus });
  }

  return { updates, downgrades };
}

// ── Procesar un contrato ──────────────────────────────────────────────────────

async function procesarContrato(
  contractId:     string,
  codigo:         string,
  includeExtra:   boolean,
  excludeToday:   boolean,
  dryRun:         boolean,
): Promise<{ pagadas: number; parciales: number; downgrades: number; balanceAntes: number | null; balanceDespues: number | null }> {
  const tipos: Array<'INSTALLMENT' | 'EXTRA_PAYMENT'> = includeExtra
    ? ['INSTALLMENT', 'EXTRA_PAYMENT']
    : ['INSTALLMENT'];

  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);

  const pagosRaw = await prisma.payment.findMany({
    where:   { contractId, paymentType: { in: tipos }, status: 'CONFIRMED' },
    orderBy: { paymentDate: 'asc' },
    select:  { id: true, amount: true, paymentDate: true },
  });
  const pagos = excludeToday ? pagosRaw.filter(p => p.paymentDate < inicioHoy) : pagosRaw;
  const excluidosHoy = pagosRaw.length - pagos.length;

  const cuotas = await prisma.cuota.findMany({
    where:   { contractId },
    orderBy: { numeroCuota: 'asc' },
    select:  { id: true, numeroCuota: true, montoEsperado: true, montoPagado: true, status: true },
  });

  if (cuotas.length === 0) {
    console.log(`  ${codigo} — sin calendario de cuotas (Patrón B), omitido`);
    return { pagadas: 0, parciales: 0, downgrades: 0, balanceAntes: null, balanceDespues: null };
  }
  if (pagos.length === 0) {
    console.log(`  ${codigo} — sin pagos INSTALLMENT aplicables, omitido${excluidosHoy ? ` (${excluidosHoy} de hoy excluidos)` : ''}`);
    return { pagadas: 0, parciales: 0, downgrades: 0, balanceAntes: null, balanceDespues: null };
  }

  const { updates, downgrades } = calcularUpdates(pagos, cuotas as CuotaActual[]);

  if (downgrades.length > 0) {
    console.log(`  ${codigo} — ⚠️  ${downgrades.length} cuota(s) YA PAGADA(s) que el recálculo dejaría peor — NO se tocan: #${downgrades.map(d => d.numeroCuota).join(', #')}`);
  }

  if (updates.length === 0) {
    console.log(`  ${codigo} — sin cambios${excluidosHoy ? ` (${excluidosHoy} pagos de hoy excluidos)` : ''}`);
    return { pagadas: 0, parciales: 0, downgrades: downgrades.length, balanceAntes: null, balanceDespues: null };
  }

  const contrato = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { balance: true, financingAmount: true },
  });

  // Balance = financiado − suma de TODO lo pagado en cuotas, incluyendo lo
  // que YA estaba correcto antes de este recálculo (cuotas no tocadas por
  // el downgrade-guard cuentan con su monto actual; las tocadas, con el
  // monto nuevo).
  const montoPagadoFinalPorCuota = new Map<string, number>();
  for (const c of cuotas) montoPagadoFinalPorCuota.set(c.id, c.montoPagado);
  for (const u of updates) montoPagadoFinalPorCuota.set(u.id, u.montoPagado);
  const totalPagadoFinal = [...montoPagadoFinalPorCuota.values()].reduce((s, v) => s + v, 0);
  const balanceNuevo = round2((contrato?.financingAmount ?? 0) - totalPagadoFinal);

  const pagadas   = updates.filter(u => u.status === CuotaStatus.PAGADA).length;
  const parciales = updates.filter(u => u.status === CuotaStatus.PENDIENTE).length;

  if (dryRun) {
    console.log(`  ${codigo} — [DRY-RUN] ${pagadas} PAGADAS | ${parciales} parcial | balance ${contrato?.balance} -> ${balanceNuevo}${excluidosHoy ? ` (${excluidosHoy} de hoy excluidos)` : ''}`);
    return { pagadas, parciales, downgrades: downgrades.length, balanceAntes: contrato?.balance ?? null, balanceDespues: balanceNuevo };
  }

  if (balanceNuevo < -0.01) {
    console.log(`  ${codigo} — ❌ balance resultante negativo ($${balanceNuevo}) — SE OMITE, no se escribe nada para este contrato`);
    return { pagadas: 0, parciales: 0, downgrades: downgrades.length, balanceAntes: contrato?.balance ?? null, balanceDespues: null };
  }

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.cuota.update({
        where: { id: u.id },
        data:  { montoPagado: u.montoPagado, fechaPago: u.fechaPago, status: u.status },
      });
    }
    await tx.contract.update({
      where: { id: contractId },
      data:  { balance: balanceNuevo },
    });
    const hoy      = new Date();
    const vencidas = await tx.cuota.count({
      where: { contractId, status: CuotaStatus.PENDIENTE, fechaVencimiento: { lt: hoy } },
    });
    await tx.contract.update({
      where: { id: contractId },
      data:  {
        moraMonthsCount: vencidas,
        status: vencidas > 0 ? ContractStatus.IN_MORA : ContractStatus.ACTIVE,
      },
    });
  });

  console.log(`  ${codigo} — ${pagadas} PAGADAS | ${parciales} parcial | balance ${contrato?.balance} -> ${balanceNuevo}${excluidosHoy ? ` (${excluidosHoy} de hoy excluidos)` : ''}`);
  return { pagadas, parciales, downgrades: downgrades.length, balanceAntes: contrato?.balance ?? null, balanceDespues: balanceNuevo };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const codeIdx = args.indexOf('--code');
  const onlyCode = codeIdx !== -1 ? args[codeIdx + 1] : undefined;
  const includeExtra = args.includes('--include-extra');
  const dryRun = args.includes('--dry-run');
  const excludeToday = args.includes('--exclude-today');

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

  console.log(`Reconciliando pagos→cuotas — ${projects.length} proyecto(s)${dryRun ? ' — [DRY-RUN, no se escribe nada]' : ''}${excludeToday ? ' — excluyendo pagos de hoy' : ''}\n`);

  let totalPagadas = 0, totalParciales = 0, totalContratos = 0, totalDowngrades = 0;
  for (const proj of projects) {
    const contratos = await prisma.contract.findMany({
      where:   { projectId: proj.id, status: { not: ContractStatus.CANCELED } },
      select:  { id: true, codigoLegado: true },
      orderBy: { codigoLegado: 'asc' },
    });
    if (contratos.length === 0) continue;

    console.log(`\n=== ${proj.code} — ${proj.name} (${contratos.length} contratos) ===`);
    let projPagadas = 0, projParciales = 0, projDowngrades = 0;
    for (const c of contratos) {
      const r = await procesarContrato(c.id, c.codigoLegado ?? c.id, includeExtra, excludeToday, dryRun);
      projPagadas    += r.pagadas;
      projParciales  += r.parciales;
      projDowngrades += r.downgrades;
    }
    console.log(`  → ${proj.code}: ${projPagadas} cuotas PAGADAS, ${projParciales} parciales, ${projDowngrades} downgrades evitados`);
    totalPagadas    += projPagadas;
    totalParciales  += projParciales;
    totalContratos  += contratos.length;
    totalDowngrades += projDowngrades;
  }

  console.log('\n════════════════════════════════════');
  console.log(`Contratos procesados     : ${totalContratos}`);
  console.log(`Total cuotas PAGADAS     : ${totalPagadas}`);
  console.log(`Total cuotas parciales   : ${totalParciales}`);
  console.log(`Downgrades evitados      : ${totalDowngrades}`);
  console.log('════════════════════════════════════');

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
