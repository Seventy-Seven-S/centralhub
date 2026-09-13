/**
 * fusionar-categorias-gasto.ts
 *
 * Une varias categorías de gasto en una sola, en TODOS los proyectos (o en uno
 * si se indica). Los archivos de cada proyecto titulan la misma cosa distinto
 * —"Despacho", "Oficina 2", "Presidencia"— y el negocio las trata igual.
 *
 * No borra gastos: solo los reapunta. Las categorías de origen que quedan sin
 * un solo gasto se retiran, porque de lo contrario siguen apareciendo en los
 * menús de alta invitando a volver a dividir lo que se acaba de unir.
 *
 * Uso:
 *   npx tsx src/scripts/fusionar-categorias-gasto.ts --a "Despacho" --de "Oficina 2" --de "Presidencia"
 *   ... --confirm            para escribir
 *   ... --proyecto SAN       para acotarlo a un proyecto
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

function valores(bandera: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => { if (a === bandera && process.argv[i + 1]) out.push(process.argv[i + 1]); });
  return out;
}

async function main() {
  const destino = valores('--a')[0];
  const origenes = valores('--de');
  const proyecto = valores('--proyecto')[0] ?? null;
  if (!destino || !origenes.length) {
    throw new Error('Uso: fusionar-categorias-gasto.ts --a "<destino>" --de "<origen>" [--de "<otro>"] [--proyecto CODE] [--confirm]');
  }

  const whereProyecto = proyecto ? { project: { code: proyecto } } : {};
  const cats = await prisma.expenseCategory.findMany({ select: { id: true, name: true } });
  const idDestino = cats.find(c => c.name === destino)?.id ?? null;
  const aMover = cats.filter(c => origenes.includes(c.name) && c.name !== destino);

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · fusionar en "${destino}"${proyecto ? ` (solo ${proyecto})` : ' (todos los proyectos)'}\n`);

  if (!aMover.length) { console.log('   Ninguna de las categorías de origen existe. Nada que hacer.\n'); return; }

  let total = 0, monto = 0;
  for (const c of aMover) {
    const r = await prisma.expense.aggregate({
      where: { categoryId: c.id, ...whereProyecto }, _count: true, _sum: { amount: true },
    });
    total += r._count; monto += Number(r._sum.amount ?? 0);
    console.log(`   ${c.name.padEnd(14)} → ${destino.padEnd(14)} ${String(r._count).padStart(4)} gastos  ${money(Number(r._sum.amount ?? 0)).padStart(16)}`);
  }
  const yaEn = await prisma.expense.aggregate({
    where: idDestino ? { categoryId: idDestino, ...whereProyecto } : { id: '' }, _count: true, _sum: { amount: true },
  });
  console.log(`\n   ya en "${destino}": ${yaEn._count} gastos · ${money(Number(yaEn._sum.amount ?? 0))}`);
  console.log(`   quedaría en: ${yaEn._count + total} gastos · ${money(Number(yaEn._sum.amount ?? 0) + monto)}`);

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }
  if (!total) { console.log('\nNada que mover.\n'); return; }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!admin) throw new Error('No hay usuario ADMIN');

  await prisma.$transaction(async tx => {
    const destinoId = idDestino
      ?? (await tx.expenseCategory.create({ data: { name: destino, createdById: admin.id }, select: { id: true } })).id;

    for (const c of aMover) {
      await tx.expense.updateMany({ where: { categoryId: c.id, ...whereProyecto }, data: { categoryId: destinoId } });
    }
    // Solo se retira la categoría si NINGÚN proyecto la usa ya: acotar la
    // fusión a uno no debe borrarle la categoría a los demás.
    for (const c of aMover) {
      const quedan = await tx.expense.count({ where: { categoryId: c.id } });
      if (quedan === 0) {
        await tx.expenseCategory.delete({ where: { id: c.id } });
        console.log(`   · categoría "${c.name}" quedó vacía y se retiró`);
      } else {
        console.log(`   · "${c.name}" conserva ${quedan} gastos de otros proyectos, no se retira`);
      }
    }
  });
  console.log(`\n✅ ${total} gastos movidos a "${destino}"\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
