/**
 * devoluciones-app-a-gastos.ts
 *
 * Las devoluciones que se hicieron en CentralHub ANTES de que cancelar creara
 * su gasto solo (2026-10-14) se restaban dos veces: como ingreso negativo y
 * como el gasto que el equipo capturaba a mano. Aquí cada una queda con
 * exactamente un gasto de Cancelaciones ligado, y con eso deja de contar
 * como ingreso (ver ingresoReal.ts). Validado por el equipo en la tabla
 * https://claude.ai/artifact/XahV1RBzWisyKDKHMtnDZS
 *
 *  - LIGAR: el gasto que ya capturaron se conecta con su devolución.
 *  - JUNTAR (H067): sus tres gastos se vuelven uno, ligado.
 *  - CREAR: la devolución nunca se capturó; se crea su gasto.
 *  - BORRAR: H210 y H211 eran contratos de prueba; se borran con sus pagos,
 *    devoluciones, recibos, notificaciones y su cliente.
 *
 * Las devoluciones migradas del sistema anterior no se tocan. Los gastos de
 * VDR de $5,040 y $5,880 que parecen de Santander tampoco: el equipo aún no
 * contesta.
 *
 *   npx tsx src/scripts/devoluciones-app-a-gastos.ts            (dry-run)
 *   npx tsx src/scripts/devoluciones-app-a-gastos.ts --confirm
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');
const $ = (n: number) => `$${n.toLocaleString('es-MX')}`;

const LIGAR = ['H032', 'H046', 'H073', 'V398', 'G034'];
const JUNTAR: Record<string, number[]> = { H067: [2323, 2019, 2323] };
const CREAR = ['K118', 'V037', 'F128', 'F140'];
const BORRAR = ['H210', 'H211'];

type Tx = Prisma.TransactionClient;

async function devolucionDe(db: Tx | PrismaClient, codigo: string) {
  const r = await db.payment.findMany({
    where: { contract: { codigoLegado: codigo }, paymentType: 'RESCISSION_REFUND', status: 'CONFIRMED', NOT: { createdBy: null } },
    include: {
      gastoDevolucion: true,
      contract: { include: { project: true, lots: { include: { lot: true } } } },
    },
  });
  if (r.length !== 1) throw new Error(`${codigo}: se esperaba 1 devolución hecha en el sistema y hay ${r.length}`);
  return r[0];
}

/** Gastos de Cancelaciones del mismo proyecto, por monto, sin ligar ni liquidar. */
async function gastosCandidatos(db: Tx | PrismaClient, projectId: string, monto: number) {
  return db.expense.findMany({
    where: {
      projectId, category: { name: 'Cancelaciones' }, pagoDevolucionId: null,
      date: { gte: new Date('2026-09-01') },
      amount: { gte: monto - 0.5, lte: monto + 0.5 },
    },
    orderBy: { date: 'asc' },
  });
}

const etiquetaLotes = (d: Awaited<ReturnType<typeof devolucionDe>>) =>
  d.contract.lots.map(l => `M${l.lot.manzana}-L${l.lot.lotNumber}`).join(', ') || 'sin lote';

async function main() {
  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · devoluciones hechas en el sistema → un gasto ligado cada una\n`);
  const categoria = await prisma.expenseCategory.findUniqueOrThrow({ where: { name: 'Cancelaciones' } });

  // ── Planear y validar TODO antes de escribir nada ──────────────────────────
  const ligar: Array<{ codigo: string; pagoId: string; gastoId: string; descontar: boolean; proyecto: string }> = [];
  for (const codigo of LIGAR) {
    const d = await devolucionDe(prisma, codigo);
    if (d.gastoDevolucion) { console.log(`  ${codigo}: ya tiene su gasto ligado, se salta`); continue; }
    const c = await gastosCandidatos(prisma, d.contract.projectId, -d.amount);
    if (c.length !== 1) throw new Error(`${codigo}: se esperaba 1 gasto de ${$(-d.amount)} en ${d.contract.project.code} y hay ${c.length}`);
    if (c[0].corteId) throw new Error(`${codigo}: su gasto ya está en un corte`);
    ligar.push({ codigo, pagoId: d.id, gastoId: c[0].id, descontar: !d.contract.project.sinCortes, proyecto: d.contract.project.code });
    console.log(`  LIGAR  ${d.contract.project.code.padEnd(4)} ${codigo}  ${$(-d.amount).padStart(8)}  ← "${c[0].description?.trim()}"`);
  }

  const juntar: Array<{ codigo: string; pagoId: string; borrar: string[]; data: Prisma.ExpenseUncheckedCreateInput }> = [];
  for (const [codigo, montos] of Object.entries(JUNTAR)) {
    const d = await devolucionDe(prisma, codigo);
    if (d.gastoDevolucion) { console.log(`  ${codigo}: ya tiene su gasto ligado, se salta`); continue; }
    const suma = montos.reduce((a, b) => a + b, 0);
    if (Math.abs(suma + d.amount) > 0.5) throw new Error(`${codigo}: los gastos suman ${$(suma)} y la devolución es ${$(-d.amount)}`);
    const usados = new Set<string>();
    for (const m of montos) {
      const g = (await gastosCandidatos(prisma, d.contract.projectId, m)).find(x => !usados.has(x.id) && x.date.toISOString().startsWith('2026-09-21'));
      if (!g) throw new Error(`${codigo}: no encontré su gasto de ${$(m)} del 21-sep`);
      if (g.corteId) throw new Error(`${codigo}: un gasto ya está en un corte`);
      usados.add(g.id);
    }
    juntar.push({
      codigo, pagoId: d.id, borrar: [...usados],
      data: {
        amount: -d.amount, date: d.paymentDate, categoryId: categoria.id, projectId: d.contract.projectId,
        description: `Cancelación de contrato ${etiquetaLotes(d)} (${codigo}) — devolución al cliente`,
        createdById: d.createdBy!, descontarEnCorte: !d.contract.project.sinCortes, pagoDevolucionId: d.id,
      },
    });
    console.log(`  JUNTAR ${d.contract.project.code.padEnd(4)} ${codigo}  ${$(-d.amount).padStart(8)}  ← ${montos.map($).join(' + ')} (3 gastos se vuelven 1)`);
  }

  const crear: Prisma.ExpenseUncheckedCreateInput[] = [];
  for (const codigo of CREAR) {
    const d = await devolucionDe(prisma, codigo);
    if (d.gastoDevolucion) { console.log(`  ${codigo}: ya tiene su gasto ligado, se salta`); continue; }
    const descontar = !d.contract.project.sinCortes;
    crear.push({
      amount: -d.amount, date: d.paymentDate, categoryId: categoria.id, projectId: d.contract.projectId,
      description: `Cancelación de contrato ${etiquetaLotes(d)} (${codigo}) — devolución al cliente`,
      createdById: d.createdBy!, descontarEnCorte: descontar, pagoDevolucionId: d.id,
    });
    console.log(`  CREAR  ${d.contract.project.code.padEnd(4)} ${codigo}  ${$(-d.amount).padStart(8)}  ${descontar ? '(se descuenta en el próximo corte)' : '(proyecto sin cortes)'}`);
  }

  const borrar = await prisma.contract.findMany({
    where: { codigoLegado: { in: BORRAR } },
    include: { client: { include: { contracts: { select: { id: true } } } }, payments: true, lots: { include: { lot: true } } },
  });
  for (const c of borrar) {
    if (c.status !== 'RESCISSION') throw new Error(`${c.codigoLegado}: se esperaba rescindido y está ${c.status}`);
    if (c.payments.some(p => p.corteId || p.corteDiarioId)) throw new Error(`${c.codigoLegado}: tiene pagos en un corte; no se borra`);
    if (c.client.contracts.length !== 1) throw new Error(`${c.codigoLegado}: su cliente tiene otros contratos; no se borra`);
    console.log(`  BORRAR SAN  ${c.codigoLegado}  ${c.client.firstName} ${c.client.lastName} · ${c.payments.length} pagos · lote ${c.lots.map(l => `M${l.lot.manzana}-L${l.lot.lotNumber} (${l.lot.status})`).join(', ')}`);
  }

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  // ── Escribir, todo o nada ──────────────────────────────────────────────────
  await prisma.$transaction(async tx => {
    for (const l of ligar) {
      await tx.expense.update({ where: { id: l.gastoId }, data: { pagoDevolucionId: l.pagoId, descontarEnCorte: l.descontar } });
    }
    for (const j of juntar) {
      await tx.expense.deleteMany({ where: { id: { in: j.borrar }, corteId: null } });
      await tx.expense.create({ data: j.data });
    }
    for (const data of crear) await tx.expense.create({ data });

    for (const c of borrar) {
      const pagos = c.payments.map(p => p.id);
      await tx.expense.updateMany({ where: { pagoDevolucionId: { in: pagos } }, data: { pagoDevolucionId: null } });
      await tx.reciboLog.deleteMany({ where: { paymentId: { in: pagos } } });
      await tx.notification.deleteMany({ where: { relatedEntityId: c.id } });
      await tx.activity.deleteMany({ where: { OR: [{ contractId: c.id }, { clientId: c.clientId }] } });
      await tx.estadoCuentaLog.deleteMany({ where: { contractId: c.id } });
      await tx.commission.deleteMany({ where: { contractId: c.id } });
      await tx.payment.deleteMany({ where: { contractId: c.id } });
      await tx.contract.delete({ where: { id: c.id } }); // cuotas, lotes ligados, cotitulares y cambios van en cascada
      await tx.client.delete({ where: { id: c.clientId } });
    }
  }, { timeout: 120000 });

  // Verificación: ninguna devolución hecha en el sistema queda sin su gasto.
  const sueltas = await prisma.payment.count({
    where: { paymentType: 'RESCISSION_REFUND', status: 'CONFIRMED', NOT: { createdBy: null }, gastoDevolucion: { is: null } },
  });
  console.log(`\n✅ Listo. Devoluciones hechas en el sistema sin gasto ligado: ${sueltas}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
