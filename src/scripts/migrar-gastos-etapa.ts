/**
 * migrar-gastos-etapa.ts
 *
 * Carga a Gastos el desglose de los cortes que se llevaban en Excel
 * ("Etapa N.xlsx") para un proyecto JSA. Idempotente: cada gasto se identifica
 * por proyecto + fecha + categoría + monto, y si ya existe se omite.
 *
 * Uso:
 *   npx tsx src/scripts/migrar-gastos-etapa.ts "<archivo.xlsx>" JSA3            # dry-run
 *   npx tsx src/scripts/migrar-gastos-etapa.ts "<archivo.xlsx>" JSA3 --confirm
 */
import { PrismaClient } from '@prisma/client';
import { leerEtapa } from './lib/etapaGastos';

const prisma = new PrismaClient();
const ARCHIVO = process.argv[2];
const PROYECTO = process.argv[3];
const CONFIRM = process.argv.includes('--confirm');
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

async function main() {
  if (!ARCHIVO || !PROYECTO) throw new Error('Uso: migrar-gastos-etapa.ts <archivo.xlsx> <JSA1|JSA3|JSA4> [--confirm]');

  const { hoja, repartos, ignoradas } = leerEtapa(ARCHIVO);
  const proyecto = await prisma.project.findFirst({ where: { code: PROYECTO }, select: { id: true, name: true } });
  if (!proyecto) throw new Error(`No existe el proyecto ${PROYECTO}`);

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · ${PROYECTO} · hoja "${hoja}"`);
  if (ignoradas.length) console.log(`   columnas ignoradas: ${ignoradas.join(', ')}`);

  // Resumen del archivo
  const porCat = new Map<string, { n: number; monto: number }>();
  let totalAbonos = 0;
  for (const r of repartos) {
    totalAbonos += r.abonos;
    for (const g of r.reparto) {
      const a = porCat.get(g.categoria) ?? { n: 0, monto: 0 };
      a.n++; a.monto += g.monto; porCat.set(g.categoria, a);
    }
  }
  const totalGastos = [...porCat.values()].reduce((s, v) => s + v.monto, 0);
  console.log(`\n   repartos: ${repartos.length} · ${repartos[0].fecha.toISOString().slice(0,10)} → ${repartos[repartos.length-1].fecha.toISOString().slice(0,10)}`);
  console.log(`   abonos en el archivo: ${money(totalAbonos)}`);
  console.log(`   desglose repartido:   ${money(totalGastos)}  (dif ${money(totalAbonos - totalGastos)})\n`);
  for (const [cat, v] of [...porCat].sort((a, b) => b[1].monto - a[1].monto))
    console.log(`     ${cat.padEnd(20)} ${String(v.n).padStart(4)}  ${money(v.monto).padStart(16)}`);

  // Qué falta contra la base
  const existentes = await prisma.expense.findMany({
    where: { projectId: proyecto.id },
    select: { date: true, amount: true, category: { select: { name: true } } },
  });
  const clave = (f: Date, cat: string, m: number) => `${f.toISOString().slice(0,10)}|${cat}|${m.toFixed(2)}`;
  const yaHay = new Set(existentes.map(e => clave(e.date, e.category?.name ?? '', Number(e.amount))));

  const faltantes = repartos.flatMap(r =>
    r.reparto
      .filter(g => !yaHay.has(clave(r.fecha, g.categoria, g.monto)))
      .map(g => ({ fecha: r.fecha, ...g })));

  console.log(`\n   en la base ya: ${existentes.length} gastos`);
  console.log(`   faltan cargar: ${faltantes.length} · ${money(faltantes.reduce((s, f) => s + f.monto, 0))}\n`);
  for (const f of faltantes.slice(0, 12))
    console.log(`     ${f.fecha.toISOString().slice(0,10)}  ${f.categoria.padEnd(20)} ${money(f.monto).padStart(14)}`);
  if (faltantes.length > 12) console.log(`     ... y ${faltantes.length - 12} más`);

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }
  if (!faltantes.length) { console.log('\nNada que cargar.\n'); return; }

  // Los gastos migrados se atribuyen al admin: el Excel no dice quién los
  // capturó, y la columna es obligatoria.
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true },
  });
  if (!admin) throw new Error('No hay usuario ADMIN para atribuir los gastos');

  // Las categorías se reusan; solo se crea la que no exista todavía.
  const cats = new Map<string, string>();
  for (const nombre of new Set(faltantes.map(f => f.categoria))) {
    const c = await prisma.expenseCategory.upsert({
      where: { name: nombre }, update: {},
      create: { name: nombre, createdById: admin.id },
      select: { id: true },
    });
    cats.set(nombre, c.id);
  }

  const archivo = ARCHIVO.split('/').pop();
  await prisma.expense.createMany({
    data: faltantes.map(f => ({
      projectId: proyecto.id,
      categoryId: cats.get(f.categoria)!,
      amount: f.monto,
      date: f.fecha,
      createdById: admin.id,
      description: `Corte ${PROYECTO} ${f.fecha.toISOString().slice(0,10)} — ${f.etiqueta} (migrado de ${archivo})`,
    })),
  });
  console.log(`\n✅ Cargados ${faltantes.length} gastos en ${PROYECTO}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
