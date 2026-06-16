/**
 * ============================================================================
 * clean-test-data.ts — Limpieza de datos de PRUEBA de CentralHub
 * ============================================================================
 *
 * PROPÓSITO
 *   El dueño hizo muchas pruebas (contratos, apartados de lotes, pagos, cuotas,
 *   documentos INE, etc.) y la base de datos quedó con datos transaccionales de
 *   prueba. Este script los borra de forma SEGURA y ATÓMICA antes de migrar los
 *   datos reales.
 *
 * SEGURIDAD (LEER ANTES DE CORRER)
 *   - Por DEFECTO el script es DRY-RUN: NO borra nada, solo cuenta e imprime
 *     cuántos registros eliminaría de cada tabla (en el orden seguro de FKs).
 *   - Para borrar de verdad hay que pasar el flag explícito `--confirm`.
 *   - Todo el borrado real va dentro de un `prisma.$transaction` (atómico:
 *     o se borra todo o no se borra nada).
 *   - El borrado es IRREVERSIBLE. Haz un backup de la DB antes de usar --confirm.
 *
 * USO
 *   # 1) Dry-run (recomendado primero) — NO borra, solo reporta counts:
 *   tsx src/scripts/clean-test-data.ts
 *
 *   # 2) Borrado real de datos transaccionales de prueba:
 *   tsx src/scripts/clean-test-data.ts --confirm
 *
 *   # 3) Además borrar estructura (projects, lots, expenses, terreno):
 *   tsx src/scripts/clean-test-data.ts --confirm --include-projects
 *
 *   # Dry-run viendo también qué incluiría --include-projects:
 *   tsx src/scripts/clean-test-data.ts --include-projects
 *
 * QUÉ BORRA (modo por defecto, datos transaccionales)
 *   estado_cuenta_logs, cuotas, commissions, payment_schedules, payments,
 *   co_owners, contract_lots, contracts, activities, documents,
 *   client_refresh_tokens, client_users, client_projects, clients.
 *   Además RESETEA los lots reservados a AVAILABLE (limpia los campos de
 *   reserva) — NO borra los lots.
 *
 * QUÉ CONSERVA (modo por defecto)
 *   users (equipo interno, incl. admin), projects, lots (su definición; solo se
 *   resetea la reserva), expense_categories.
 *
 * QUÉ AÑADE --include-projects (estructura, opcional)
 *   pagos_terreno, compromisos_terreno, expenses, lots (borrado completo),
 *   projects. (expense_categories y users SIEMPRE se conservan.)
 *
 * SUPUESTOS DE ALCANCE (validar antes de correr) — ver bloque al final.
 * ============================================================================
 */

import { PrismaClient, LotStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ── Flags ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const INCLUDE_PROJECTS = args.includes('--include-projects');

// Validación temprana de flags desconocidos para evitar typos peligrosos
const KNOWN_FLAGS = new Set(['--confirm', '--include-projects']);
const unknown = args.filter((a) => !KNOWN_FLAGS.has(a));
if (unknown.length > 0) {
  console.error(`\n❌ Flag(s) no reconocido(s): ${unknown.join(', ')}`);
  console.error('   Flags válidos: --confirm, --include-projects\n');
  process.exit(1);
}

// ── Helpers de conteo ────────────────────────────────────────────────────────
type CountFn = () => Promise<number>;

interface Step {
  label: string;   // nombre de tabla / operación (para el reporte)
  count: CountFn;  // cuántos registros afecta
  apply: (tx: Prisma.TransactionClient) => Promise<unknown>; // borrado/reset real
}

/**
 * Construye la lista ordenada de pasos (hijos -> padres) respetando FKs.
 * El orden importa: borramos primero lo que apunta a otras tablas.
 */
function buildSteps(): Step[] {
  const steps: Step[] = [
    // ── Todo lo colgado de contracts (hijos primero) ──
    {
      label: 'estado_cuenta_logs',
      count: () => prisma.estadoCuentaLog.count(),
      apply: (tx) => tx.estadoCuentaLog.deleteMany({}),
    },
    {
      label: 'cuotas',
      count: () => prisma.cuota.count(),
      apply: (tx) => tx.cuota.deleteMany({}),
    },
    {
      label: 'commissions',
      count: () => prisma.commission.count(),
      apply: (tx) => tx.commission.deleteMany({}),
    },
    {
      label: 'payment_schedules',
      count: () => prisma.paymentSchedule.count(),
      apply: (tx) => tx.paymentSchedule.deleteMany({}),
    },
    {
      label: 'payments',
      count: () => prisma.payment.count(),
      apply: (tx) => tx.payment.deleteMany({}),
    },
    {
      label: 'co_owners',
      count: () => prisma.coOwner.count(),
      apply: (tx) => tx.coOwner.deleteMany({}),
    },
    {
      label: 'contract_lots',
      count: () => prisma.contractLot.count(),
      apply: (tx) => tx.contractLot.deleteMany({}),
    },
    {
      label: 'contracts',
      count: () => prisma.contract.count(),
      apply: (tx) => tx.contract.deleteMany({}),
    },

    // ── Actividades y documentos de prueba ──
    {
      label: 'activities',
      count: () => prisma.activity.count(),
      apply: (tx) => tx.activity.deleteMany({}),
    },
    {
      label: 'documents (INE y adjuntos)',
      count: () => prisma.document.count(),
      apply: (tx) => tx.document.deleteMany({}),
    },

    // ── Reset de reservas de lotes (NO borra lots) ──
    // Solo en modo por defecto. Con --include-projects los lots se borran abajo.
    ...(INCLUDE_PROJECTS
      ? []
      : [
          {
            label: 'lots → reset reserva a AVAILABLE (update, no borra)',
            count: () =>
              prisma.lot.count({
                where: {
                  OR: [
                    { status: LotStatus.RESERVED },
                    { reservedAt: { not: null } },
                    { reservationExpiry: { not: null } },
                    { reservationDeposit: { not: null } },
                    { reservedByName: { not: null } },
                    { reservedByPhone: { not: null } },
                    { reservedByEmail: { not: null } },
                    { reservedByAgentId: { not: null } },
                  ],
                },
              }),
            apply: (tx: Prisma.TransactionClient) =>
              tx.lot.updateMany({
                where: {
                  OR: [
                    { status: LotStatus.RESERVED },
                    { reservedAt: { not: null } },
                    { reservationExpiry: { not: null } },
                    { reservationDeposit: { not: null } },
                    { reservedByName: { not: null } },
                    { reservedByPhone: { not: null } },
                    { reservedByEmail: { not: null } },
                    { reservedByAgentId: { not: null } },
                  ],
                },
                data: {
                  status: LotStatus.AVAILABLE,
                  reservedAt: null,
                  reservationExpiry: null,
                  reservationDeposit: null,
                  reservedByName: null,
                  reservedByPhone: null,
                  reservedByEmail: null,
                  reservedByAgentId: null,
                },
              }),
          },
        ]),

    // ── Clientes de prueba (hijos primero por las FKs) ──
    {
      label: 'client_refresh_tokens',
      count: () => prisma.clientRefreshToken.count(),
      apply: (tx) => tx.clientRefreshToken.deleteMany({}),
    },
    {
      label: 'client_users',
      count: () => prisma.clientUser.count(),
      apply: (tx) => tx.clientUser.deleteMany({}),
    },
    {
      label: 'client_projects',
      count: () => prisma.clientProject.count(),
      apply: (tx) => tx.clientProject.deleteMany({}),
    },
    {
      label: 'clients',
      count: () => prisma.client.count(),
      apply: (tx) => tx.client.deleteMany({}),
    },
  ];

  // ── Estructura (solo con --include-projects) ──
  if (INCLUDE_PROJECTS) {
    steps.push(
      {
        label: 'pagos_terreno',
        count: () => prisma.pagoTerreno.count(),
        apply: (tx) => tx.pagoTerreno.deleteMany({}),
      },
      {
        label: 'compromisos_terreno',
        count: () => prisma.compromisoTerreno.count(),
        apply: (tx) => tx.compromisoTerreno.deleteMany({}),
      },
      {
        label: 'expenses',
        count: () => prisma.expense.count(),
        apply: (tx) => tx.expense.deleteMany({}),
      },
      {
        label: 'lots (BORRADO completo)',
        count: () => prisma.lot.count(),
        apply: (tx) => tx.lot.deleteMany({}),
      },
      {
        label: 'projects',
        count: () => prisma.project.count(),
        apply: (tx) => tx.project.deleteMany({}),
      },
    );
  }

  return steps;
}

// ── Reporte de "lo que se conserva" (informativo) ────────────────────────────
async function reportPreserved(): Promise<void> {
  const [users, expenseCategories, projects, lots] = await Promise.all([
    prisma.user.count(),
    prisma.expenseCategory.count(),
    prisma.project.count(),
    prisma.lot.count(),
  ]);

  console.log('\n🛡️  SE CONSERVA:');
  console.log(`   users (equipo interno, incl. admin): ${users}`);
  console.log(`   expense_categories: ${expenseCategories}`);
  if (!INCLUDE_PROJECTS) {
    console.log(`   projects: ${projects}`);
    console.log(`   lots (solo se resetea la reserva): ${lots}`);
  } else {
    console.log('   (--include-projects activo: projects y lots se BORRAN)');
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('============================================================');
  console.log('  CentralHub — Limpieza de datos de PRUEBA');
  console.log('============================================================');
  console.log(`  Modo:            ${CONFIRM ? '🔴 BORRADO REAL (--confirm)' : '🟢 DRY-RUN (sin borrar)'}`);
  console.log(`  include-projects: ${INCLUDE_PROJECTS ? 'SÍ (borra estructura)' : 'NO'}`);
  console.log('============================================================\n');

  const steps = buildSteps();

  // 1) Conteo previo (en orden) — se hace siempre, dry-run o no.
  console.log('📋 Registros afectados por tabla (en orden de FKs):\n');
  const counts: number[] = [];
  let total = 0;
  for (const step of steps) {
    const n = await step.count();
    counts.push(n);
    total += n;
    console.log(`   ${String(n).padStart(6)}  ${step.label}`);
  }
  console.log('   ------');
  console.log(`   ${String(total).padStart(6)}  TOTAL (registros borrados/reseteados)\n`);

  await reportPreserved();

  // 2) DRY-RUN: terminar sin tocar nada.
  if (!CONFIRM) {
    console.log('\n------------------------------------------------------------');
    console.log('🟢 DRY RUN — no se borró nada (usa --confirm para ejecutar).');
    console.log('   Revisa los counts de arriba antes de correr el borrado real.');
    console.log('------------------------------------------------------------\n');
    return;
  }

  // 3) BORRADO REAL — pausa de seguridad antes de la transacción.
  console.log('\n⚠️  --confirm detectado: se va a BORRAR de forma IRREVERSIBLE.');
  console.log('    Tienes 5 segundos para cancelar con Ctrl+C...\n');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log('🔻 Ejecutando borrado dentro de una transacción atómica...\n');
  const results: Array<{ label: string; affected: number }> = [];

  await prisma.$transaction(async (tx) => {
    for (const step of steps) {
      const res = (await step.apply(tx)) as { count?: number };
      const affected = typeof res?.count === 'number' ? res.count : 0;
      results.push({ label: step.label, affected });
      console.log(`   ✔ ${String(affected).padStart(6)}  ${step.label}`);
    }
  });

  const totalAffected = results.reduce((acc, r) => acc + r.affected, 0);
  console.log('\n------------------------------------------------------------');
  console.log(`✅ LISTO. Registros borrados/reseteados: ${totalAffected}`);
  console.log('   La transacción se confirmó (commit). Operación irreversible.');
  console.log('------------------------------------------------------------\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Error — la transacción se revirtió (rollback), no se borró nada parcial:');
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * ============================================================================
 * SUPUESTOS DE ALCANCE — VALIDAR ANTES DE CORRER CON --confirm
 * ============================================================================
 *
 * 1. BORRA TODO, no filtra por "prueba". Como el dueño dice que TODA la data
 *    actual es de prueba, el script vacía completamente las tablas listadas
 *    (deleteMany sin where). NO distingue registros reales de los de prueba.
 *    => Si ya hubiera algún cliente/contrato REAL en la DB, también se borraría.
 *       Validar que la DB solo tiene datos de prueba antes de --confirm.
 *
 * 2. users y expense_categories NUNCA se borran (equipo interno y catálogo).
 *    Si algún user de prueba debe eliminarse, hacerlo a mano.
 *
 * 3. Modo por defecto: projects y lots se CONSERVAN. Los lots solo se
 *    "des-reservan" (status -> AVAILABLE y campos reservedBy.. / reservation..
 *    a null). La definición del lote (precio, área, manzana) NO se toca.
 *
 * 4. payment_schedules se incluye en el borrado por defecto (está colgado de
 *    contracts vía cuotas/plan de pago). No estaba nombrado explícitamente en
 *    el pedido pero es data transaccional de prueba ligada a contracts.
 *    => Confirmar que se quiere borrar también el calendario de pagos.
 *
 * 5. documents borra TODOS los documentos (INE, recibos, contratos PDF, etc.),
 *    no solo los de tipo INE. Borra los REGISTROS en DB; NO elimina archivos
 *    físicos en /uploads ni en storage/Drive. Limpiar esos archivos es aparte.
 *
 * 6. --include-projects borra projects, lots, expenses, compromisos_terreno y
 *    pagos_terreno. Úsalo SOLO si también se re-migrará la estructura. Tras
 *    esto la DB queda sin proyectos ni inventario (solo users y categorías).
 *
 * 7. Atomicidad: todo el borrado va en un único prisma.$transaction. Si algo
 *    falla, se revierte completo (rollback). Para datasets muy grandes podría
 *    requerir subir el timeout de la transacción (opción { timeout } de Prisma),
 *    pero con ~98 contratos / ~77 clientes el volumen es trivial.
 *
 * 8. No resetea secuencias/auto-increment (los IDs son UUID, no aplica).
 * ============================================================================
 */
