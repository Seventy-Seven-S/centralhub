/**
 * mover-gastos-de-proyecto.ts
 *
 * Reasigna gastos de un proyecto a otro. Caso real: los pagos del terreno de
 * Monarca 2 se registraron en Valle del Roble porque así venían en su archivo,
 * pero el terreno es de Monarca 2 y cargarlos ahí le resta rentabilidad a un
 * proyecto y se la regala al otro.
 *
 * No borra ni recrea: solo cambia el proyecto, así que conserva id, fecha,
 * monto, descripción y quién lo registró.
 *
 * Uso:
 *   npx tsx src/scripts/tools/mover-gastos-de-proyecto.ts --de VDR --a MON2 --categoria "Terreno Monarca 2"
 *   ... --confirm
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const arg = (b: string) => { const i = process.argv.indexOf(b); return i >= 0 ? process.argv[i + 1] : null; };

async function totales(projectId: string) {
  const [pg, eg, oi] = await Promise.all([
    prisma.payment.aggregate({ where: { status: 'CONFIRMED', contract: { projectId } }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { projectId }, _sum: { amount: true } }),
    prisma.otroIngreso.aggregate({ where: { projectId }, _sum: { monto: true } }),
  ]);
  const ing = (pg._sum.amount ?? 0) + (oi._sum.monto ?? 0);
  const egr = Number(eg._sum.amount ?? 0);
  return { ing, egr, dif: ing - egr };
}

async function main() {
  const de = arg('--de'), a = arg('--a'), categoria = arg('--categoria');
  if (!de || !a || !categoria)
    throw new Error('Uso: mover-gastos-de-proyecto.ts --de <CODE> --a <CODE> --categoria "<nombre>" [--confirm]');
  if (de === a) throw new Error('El origen y el destino son el mismo proyecto');

  const [origen, destino] = await Promise.all([
    prisma.project.findFirst({ where: { code: de }, select: { id: true, name: true } }),
    prisma.project.findFirst({ where: { code: a }, select: { id: true, name: true } }),
  ]);
  if (!origen) throw new Error(`No existe el proyecto ${de}`);
  if (!destino) throw new Error(`No existe el proyecto ${a}`);

  const gastos = await prisma.expense.findMany({
    where: { projectId: origen.id, category: { name: categoria } },
    select: { id: true, date: true, amount: true, description: true },
    orderBy: { date: 'asc' },
  });
  if (!gastos.length) { console.log(`\nNo hay gastos de "${categoria}" en ${de}.\n`); return; }

  const monto = gastos.reduce((s, g) => s + Number(g.amount), 0);
  const antesO = await totales(origen.id), antesD = await totales(destino.id);

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · mover "${categoria}" de ${de} a ${a}\n`);
  console.log(`   ${gastos.length} gastos · ${money(monto)} · ${gastos[0].date.toISOString().slice(0, 10)} → ${gastos.at(-1)!.date.toISOString().slice(0, 10)}`);
  for (const g of gastos.slice(0, 5))
    console.log(`      ${g.date.toISOString().slice(0, 10)}  ${money(Number(g.amount)).padStart(14)}  "${(g.description ?? '').slice(0, 44)}"`);
  if (gastos.length > 5) console.log(`      … y ${gastos.length - 5} más`);

  const fmt = (t: { ing: number; egr: number; dif: number }) =>
    `ingresos ${money(t.ing).padStart(16)} · egresos ${money(t.egr).padStart(16)} · diferencia ${money(t.dif)}`;
  console.log(`\n   ${de}  antes:   ${fmt(antesO)}`);
  console.log(`   ${de}  después: ${fmt({ ing: antesO.ing, egr: antesO.egr - monto, dif: antesO.dif + monto })}`);
  console.log(`\n   ${a}  antes:   ${fmt(antesD)}`);
  console.log(`   ${a}  después: ${fmt({ ing: antesD.ing, egr: antesD.egr + monto, dif: antesD.dif - monto })}`);

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  const r = await prisma.expense.updateMany({
    where: { id: { in: gastos.map(g => g.id) } },
    data: { projectId: destino.id },
  });
  console.log(`\n✅ ${r.count} gastos movidos de ${de} a ${a}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
