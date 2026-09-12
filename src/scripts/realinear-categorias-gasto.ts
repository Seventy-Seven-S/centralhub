/**
 * realinear-categorias-gasto.ts
 *
 * Reagrupa los gastos de UN proyecto cuando el dueño del negocio cambia sus
 * categorías. Caso real: el arquitecto reagrupó Santander — Despacho pasó a
 * Oficina 2, Maquinaria y Planos se juntaron, y Sueldos y Varios se volvieron
 * Administrativos.
 *
 * Solo mueve los gastos DEL PROYECTO indicado: categorías como "Planos" las
 * comparten los JSA y no deben cambiar por una decisión de Santander.
 *
 * Uso:
 *   npx tsx src/scripts/realinear-categorias-gasto.ts SAN            # dry-run
 *   npx tsx src/scripts/realinear-categorias-gasto.ts SAN --confirm
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PROYECTO = process.argv[2];
const CONFIRM = process.argv.includes('--confirm');
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

/** de → a. Las categorías de origen que queden vacías se retiran. */
const MAPA: Record<string, Record<string, string>> = {
  SAN: {
    'Despacho': 'Oficina 2',
    'Maquinaria': 'Planos, Trazo y Maquinaria',
    'Planos': 'Planos, Trazo y Maquinaria',
    'Sueldos': 'Administrativos',
    'Varios': 'Administrativos',
  },
};

async function main() {
  const mapa = MAPA[PROYECTO];
  if (!mapa) throw new Error(`No hay realineamiento definido para ${PROYECTO}`);

  const proyecto = await prisma.project.findFirst({ where: { code: PROYECTO }, select: { id: true } });
  if (!proyecto) throw new Error(`No existe el proyecto ${PROYECTO}`);

  const actuales = await prisma.expense.groupBy({
    by: ['categoryId'], where: { projectId: proyecto.id }, _count: true, _sum: { amount: true },
  });
  const cats = await prisma.expenseCategory.findMany({ select: { id: true, name: true } });
  const nombrePorId = new Map(cats.map(c => [c.id, c.name]));
  const idPorNombre = new Map(cats.map(c => [c.name, c.id]));

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · realinear categorías de ${PROYECTO}\n`);
  const movimientos = actuales
    .map(a => ({ de: nombrePorId.get(a.categoryId) ?? '?', n: a._count, monto: Number(a._sum.amount ?? 0) }))
    .filter(m => mapa[m.de])
    .map(m => ({ ...m, a: mapa[m.de] }));

  if (!movimientos.length) { console.log('   Nada que realinear.\n'); return; }
  for (const m of movimientos)
    console.log(`   ${m.de.padEnd(12)} → ${m.a.padEnd(28)} ${String(m.n).padStart(4)} gastos  ${money(m.monto).padStart(15)}`);

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!admin) throw new Error('No hay usuario ADMIN');

  await prisma.$transaction(async tx => {
    for (const m of movimientos) {
      let destinoId = idPorNombre.get(m.a);
      if (!destinoId) {
        const creada = await tx.expenseCategory.create({ data: { name: m.a, createdById: admin.id }, select: { id: true } });
        destinoId = creada.id; idPorNombre.set(m.a, destinoId);
      }
      await tx.expense.updateMany({
        where: { projectId: proyecto.id, categoryId: idPorNombre.get(m.de) ?? '' },
        data: { categoryId: destinoId },
      });
    }
    // Una categoría que ya no usa NINGÚN proyecto solo estorba en los menús.
    for (const de of new Set(movimientos.map(m => m.de))) {
      const quedan = await tx.expense.count({ where: { category: { name: de } } });
      if (quedan === 0) {
        await tx.expenseCategory.deleteMany({ where: { name: de } });
        console.log(`   · categoría "${de}" quedó vacía y se retiró`);
      }
    }
  });
  console.log(`\n✅ Categorías de ${PROYECTO} realineadas\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
