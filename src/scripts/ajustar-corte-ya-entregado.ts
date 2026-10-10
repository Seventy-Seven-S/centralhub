/**
 * ajustar-corte-ya-entregado.ts
 *
 * Convierte un corte hecho en la app en un AJUSTE: sus pagos quedan liquidados
 * (no vuelven a salir como pendientes), pero sin registrar una entrega nueva,
 * porque ese dinero ya se le había dado al dueño y ya está en Gastos.
 *
 * Caso real: el primer corte de VDB en la app (10-oct-2026) liquidó los $396K
 * cobrados desde el 10-ago, que Rogelio ya había recibido como adelantos.
 *
 * Qué hace con --confirm, en una transacción:
 *  - Borra los gastos que el corte CREÓ (su reparto y lo "entregado al dueño").
 *  - Los gastos "por descontar" que el corte solo ligó vuelven a quedar libres.
 *  - El corte queda con egresos y entrega en 0, y una nota que lo explica.
 *
 *   npx tsx src/scripts/ajustar-corte-ya-entregado.ts <PROYECTO> <NUMERO>
 *   ... --confirm
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const [PROYECTO, NUMERO] = process.argv.slice(2);
const CONFIRM = process.argv.includes('--confirm');
const $ = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

async function main() {
  if (!PROYECTO || !NUMERO) throw new Error('Uso: ajustar-corte-ya-entregado.ts <PROYECTO> <NUMERO> [--confirm]');

  const corte = await prisma.corte.findFirst({
    where: { project: { code: PROYECTO }, numero: Number(NUMERO) },
    include: {
      expenses: { include: { category: { select: { name: true } } } },
      _count: { select: { payments: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!corte) throw new Error(`${PROYECTO} no tiene el corte #${NUMERO}`);

  // El corte crea sus gastos con la etiqueta "Corte #N <PROY> <fecha>"; los
  // que solo ligó (capturados antes en Gastos) traen su propia descripción.
  const etiqueta = `Corte #${corte.numero} ${PROYECTO}`;
  const creados = corte.expenses.filter(e => (e.description ?? '').startsWith(etiqueta));
  const ligados = corte.expenses.filter(e => !creados.includes(e));

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · ${PROYECTO} corte #${corte.numero} del ${corte.fecha.toISOString().slice(0, 10)}`);
  console.log(`   hecho por ${corte.createdBy.firstName} ${corte.createdBy.lastName} el ${corte.createdAt.toISOString()}`);
  console.log(`   ${corte._count.payments} pagos · ingresos ${$(corte.totalIngresos)} · egresos ${$(corte.totalEgresos)} · entregado a ${corte.dueno} ${$(corte.entregadoDueno)}`);
  console.log(`\n   Gastos que el corte creó y se BORRARÍAN (${creados.length}):`);
  creados.forEach(e => console.log(`     ${e.category.name.padEnd(20)} ${$(Number(e.amount)).padStart(16)}  ${e.description}`));
  if (ligados.length) {
    console.log(`\n   Gastos "por descontar" que solo ligó y quedarían LIBRES otra vez (${ligados.length}):`);
    ligados.forEach(e => console.log(`     ${e.category.name.padEnd(20)} ${$(Number(e.amount)).padStart(16)}  ${e.description}`));
  }
  console.log(`\n   Los ${corte._count.payments} pagos siguen liquidados en este corte.`);

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  await prisma.$transaction(async tx => {
    if (creados.length) await tx.expense.deleteMany({ where: { id: { in: creados.map(e => e.id) }, corteId: corte.id } });
    if (ligados.length) await tx.expense.updateMany({ where: { id: { in: ligados.map(e => e.id) } }, data: { corteId: null } });
    await tx.corte.update({
      where: { id: corte.id },
      data: {
        totalEgresos: 0, entregadoDueno: 0,
        notas: [corte.notas, `Ajuste: estos pagos ya se le habían entregado al dueño (registrado en Gastos). ` +
          `El corte solo los liquida; no hay entrega nueva.`].filter(Boolean).join(' · '),
      },
    });
  });
  console.log(`\n✅ Corte #${corte.numero} de ${PROYECTO} ajustado: pagos liquidados, sin entrega nueva.\n`);
}

main().catch(e => { console.error('❌', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
