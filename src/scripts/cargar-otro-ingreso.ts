/**
 * cargar-otro-ingreso.ts
 *
 * Registra dinero que entró al proyecto sin venir de un cliente: aportaciones
 * del dueño del terreno para que la inmobiliaria pudiera cubrir gastos.
 *
 * Estos movimientos vienen en las hojas de gastos del sistema viejo como un
 * renglón NEGATIVO en una columna sin encabezado ("Ajuste al dinero dio Don
 * Jose" en Santander, "Ingreso Central" en Puerta del Sol). Su gasto sí se
 * migró; lo que faltaba era la contraparte, y sin ella la diferencia del
 * proyecto sale en rojo por un dinero que sí entró.
 *
 * Uso:
 *   npx tsx src/scripts/cargar-otro-ingreso.ts SAN 2025-12-18 345000 "Aportación del dueño del terreno"
 *   ... --confirm
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const [PROYECTO, FECHA, MONTO, CONCEPTO] = process.argv.slice(2);
const CONFIRM = process.argv.includes('--confirm');
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

async function main() {
  if (!PROYECTO || !FECHA || !MONTO || !CONCEPTO)
    throw new Error('Uso: cargar-otro-ingreso.ts <PROYECTO> <YYYY-MM-DD> <monto> "<concepto>" [--confirm]');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(FECHA)) throw new Error('La fecha va como YYYY-MM-DD');
  const monto = Number(MONTO);
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('El monto debe ser un número positivo');

  const proyecto = await prisma.project.findFirst({ where: { code: PROYECTO }, select: { id: true, name: true } });
  if (!proyecto) throw new Error(`No existe el proyecto ${PROYECTO}`);

  const fecha = new Date(`${FECHA}T00:00:00.000Z`);
  // Correr esto dos veces duplicaría el ingreso y el ajuste dejaría de cuadrar.
  const yaExiste = await prisma.otroIngreso.findFirst({
    where: { projectId: proyecto.id, fecha, monto },
    select: { id: true, concepto: true },
  });

  const cobrado = await prisma.payment.aggregate({
    where: { status: 'CONFIRMED', contract: { projectId: proyecto.id } }, _sum: { amount: true },
  });
  const gastado = await prisma.expense.aggregate({ where: { projectId: proyecto.id }, _sum: { amount: true } });
  const otros = await prisma.otroIngreso.aggregate({ where: { projectId: proyecto.id }, _sum: { monto: true } });
  const ing = (cobrado._sum.amount ?? 0) + (otros._sum.monto ?? 0);
  const egr = Number(gastado._sum.amount ?? 0);

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · otro ingreso en ${PROYECTO}\n`);
  console.log(`   ${FECHA}  ${money(monto)}  "${CONCEPTO}"`);
  if (yaExiste) { console.log(`\n   ⚠ Ya existe uno idéntico ("${yaExiste.concepto}"). No se carga.\n`); return; }
  console.log(`\n   antes:   ingresos ${money(ing).padStart(16)} · egresos ${money(egr).padStart(16)} · diferencia ${money(ing - egr)}`);
  console.log(`   después: ingresos ${money(ing + monto).padStart(16)} · egresos ${money(egr).padStart(16)} · diferencia ${money(ing + monto - egr)}`);

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!admin) throw new Error('No hay usuario ADMIN');
  await prisma.otroIngreso.create({
    data: { projectId: proyecto.id, monto, fecha, concepto: CONCEPTO, createdById: admin.id },
  });
  console.log(`\n✅ Registrado en ${PROYECTO}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
