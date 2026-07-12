/**
 * ============================================================================
 * wipe-jsa-projects.ts — Borra los datos transaccionales de JSA1-4 para
 * re-migrarlos con el parser reparado (historial de pagos completo).
 * ============================================================================
 *
 * QUÉ BORRA (solo contratos de proyectos con code JSA1..JSA4, en orden de FKs):
 *   activities, estado_cuenta_logs, cuotas, commissions, payment_schedules,
 *   payments, co_owners, contract_lots, contracts.
 *
 * QUÉ CONSERVA
 *   projects, lots (los contract_lots se recrean al re-migrar), clients
 *   (findOrCreateClient los reutiliza por nombre normalizado — borrarlos
 *   rompería contratos de otros proyectos del mismo cliente).
 *
 * USO
 *   tsx src/scripts/wipe-jsa-projects.ts            # dry-run: solo cuenta
 *   tsx src/scripts/wipe-jsa-projects.ts --confirm  # borra (haz backup antes)
 * ============================================================================
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');
const JSA_CODES = ['JSA1', 'JSA2', 'JSA3', 'JSA4'];

async function main() {
  const projects = await prisma.project.findMany({ where: { code: { in: JSA_CODES } } });
  if (projects.length === 0) throw new Error('No se encontraron proyectos JSA1-4');
  console.log(`Proyectos: ${projects.map(p => `${p.code} (${p.name})`).join(', ')}`);

  const contractsWhere = { projectId: { in: projects.map(p => p.id) } };
  const contractIds = (await prisma.contract.findMany({ where: contractsWhere, select: { id: true } })).map(c => c.id);
  const contractWhere = { contractId: { in: contractIds } };

  const counts = {
    activities:       await prisma.activity.count({ where: contractWhere }),
    estadoCuentaLogs: await prisma.estadoCuentaLog.count({ where: contractWhere }),
    cuotas:           await prisma.cuota.count({ where: contractWhere }),
    commissions:      await prisma.commission.count({ where: contractWhere }),
    paymentSchedules: await prisma.paymentSchedule.count({ where: contractWhere }),
    payments:         await prisma.payment.count({ where: contractWhere }),
    coOwners:         await prisma.coOwner.count({ where: contractWhere }),
    contractLots:     await prisma.contractLot.count({ where: contractWhere }),
    contracts:        await prisma.contract.count({ where: contractsWhere }),
  };
  console.table(counts);

  if (!CONFIRM) {
    console.log('\n(DRY-RUN — nada borrado. Usa --confirm para borrar de verdad.)');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.activity.deleteMany({ where: contractWhere });
    await tx.estadoCuentaLog.deleteMany({ where: contractWhere });
    await tx.cuota.deleteMany({ where: contractWhere });
    await tx.commission.deleteMany({ where: contractWhere });
    await tx.paymentSchedule.deleteMany({ where: contractWhere });
    await tx.payment.deleteMany({ where: contractWhere });
    await tx.coOwner.deleteMany({ where: contractWhere });
    await tx.contractLot.deleteMany({ where: contractWhere });
    await tx.contract.deleteMany({ where: contractsWhere });
  }, { timeout: 120000 });

  console.log('\n✓ Datos transaccionales de JSA1-4 borrados (transacción atómica).');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
