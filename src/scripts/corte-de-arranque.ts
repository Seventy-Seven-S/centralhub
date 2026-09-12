/**
 * corte-de-arranque.ts
 *
 * Crea el corte #1 de un proyecto que venía liquidándose en Excel: un solo
 * corte que absorbe toda la historia ya repartida en el sistema anterior, para
 * que el próximo corte en la app arranque limpio.
 *
 * Por qué egresos = ingresos y entregado = 0: ese dinero YA se le entregó al
 * dueño mes con mes en el sistema viejo (y su desglose está en Gastos). El
 * corte de arranque no mueve dinero, solo cierra el pasado. Si se pusiera
 * entregado > 0 la app reportaría una entrega que no ocurrió hoy.
 *
 * Los enganches también se absorben: no aparecían en la hoja de cortes, pero sí
 * son ingresos del proyecto y de otro modo caerían en el próximo corte real.
 *
 * Uso:
 *   npx tsx src/scripts/corte-de-arranque.ts JSA1 2026-08-18 "Jesús y Maribel"
 *   npx tsx src/scripts/corte-de-arranque.ts JSA1 2026-08-18 "Jesús y Maribel" --confirm
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const [PROYECTO, FECHA, DUENO] = process.argv.slice(2);
const CONFIRM = process.argv.includes('--confirm');
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

async function main() {
  if (!PROYECTO || !FECHA || !DUENO) throw new Error('Uso: corte-de-arranque.ts <CODIGO> <YYYY-MM-DD> "<Dueño>" [--confirm]');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(FECHA)) throw new Error('La fecha va como YYYY-MM-DD');

  const proyecto = await prisma.project.findFirst({ where: { code: PROYECTO }, select: { id: true, name: true } });
  if (!proyecto) throw new Error(`No existe el proyecto ${PROYECTO}`);

  const yaHay = await prisma.corte.count({ where: { projectId: proyecto.id } });
  if (yaHay > 0) throw new Error(`${PROYECTO} ya tiene ${yaHay} corte(s). El de arranque solo se hace una vez.`);

  // Fin del día: un pago capturado el mismo 18 de agosto entra al corte.
  const hasta = new Date(`${FECHA}T23:59:59.999Z`);

  const pagos = await prisma.payment.findMany({
    where: {
      status: 'CONFIRMED', corteId: null,
      contract: { projectId: proyecto.id },
      paymentDate: { lte: hasta },
    },
    select: { id: true, amount: true, paymentDate: true },
  });
  if (!pagos.length) throw new Error('No hay pagos que absorber');

  const total = pagos.reduce((s, p) => s + p.amount, 0);
  const fechas = pagos.map(p => p.paymentDate).sort((a, b) => a.getTime() - b.getTime());
  const gastos = await prisma.expense.aggregate({
    where: { projectId: proyecto.id, date: { lte: hasta } }, _sum: { amount: true }, _count: true,
  });

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · corte de arranque de ${PROYECTO} (${proyecto.name})\n`);
  console.log(`   dueño:    ${DUENO}`);
  console.log(`   fecha:    ${FECHA}`);
  console.log(`   periodo:  ${fechas[0].toISOString().slice(0,10)} → ${FECHA}`);
  console.log(`   absorbe:  ${pagos.length} pagos · ${money(total)}`);
  console.log(`   gastos ya registrados en ese periodo: ${gastos._count} · ${money(Number(gastos._sum.amount ?? 0))}`);

  const despues = await prisma.payment.aggregate({
    where: { status: 'CONFIRMED', corteId: null, contract: { projectId: proyecto.id }, paymentDate: { gt: hasta } },
    _sum: { amount: true }, _count: true,
  });
  console.log(`   queda para el próximo corte: ${despues._count} pagos · ${money(Number(despues._sum.amount ?? 0))}\n`);

  if (!CONFIRM) { console.log('Nada escrito. Repite con --confirm.\n'); return; }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!admin) throw new Error('No hay usuario ADMIN');

  await prisma.$transaction(async tx => {
    const corte = await tx.corte.create({
      data: {
        projectId: proyecto.id, numero: 1,
        fecha: new Date(`${FECHA}T00:00:00.000Z`),
        periodoInicio: fechas[0], periodoFin: new Date(`${FECHA}T00:00:00.000Z`),
        totalIngresos: total, totalEgresos: total, entregadoDueno: 0,
        dueno: DUENO, createdById: admin.id,
        notas: `Corte de arranque: cubre todo lo que se liquidó en el sistema anterior ` +
               `(cortes en Excel hasta el ${FECHA}). Los egresos de esos repartos ya están ` +
               `registrados en Gastos, por eso no hay entrega pendiente al dueño.`,
      },
    });
    await tx.payment.updateMany({ where: { id: { in: pagos.map(p => p.id) } }, data: { corteId: corte.id } });
    console.log(`\n✅ Corte #1 de ${PROYECTO} creado · ${pagos.length} pagos ligados\n`);
  });
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
