/**
 * Carga las comisiones de Alberto de `backups/COMISIONES.xlsx` como gastos de
 * "Asesores" marcados para descontarse en el próximo corte de cada proyecto.
 *
 * Decisiones (2026-10-10):
 *  - Fecha = la de firma del Excel (2026). No importa para el corte: lo que
 *    las hace salir es la casilla, no la fecha.
 *  - K125 son DOS comisiones de $14,000, una por lote (M8-L2 y M8-L3). La nota
 *    del Excel sobre el K118 es solo informativa.
 *  - Los Cisnes M2-L23 queda fuera hasta que se dé de alta su contrato.
 *
 * Valida cada contrato y su lote antes de escribir, y no duplica: si ya existe
 * un gasto con la misma descripción en el proyecto, lo salta.
 *
 *   npx tsx src/scripts/_historico/cargar-comisiones-octubre.ts            # solo muestra
 *   npx tsx src/scripts/_historico/cargar-comisiones-octubre.ts --confirm  # escribe
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');

const COMISIONES: Array<{ codigo: string; manzana: number; lote: string; monto: number; fecha: string }> = [
  { codigo: 'V464',   manzana: 13, lote: '29', monto: 10000, fecha: '2026-08-27' },
  { codigo: 'V465',   manzana: 4,  lote: '36', monto: 10000, fecha: '2026-09-17' },
  { codigo: 'K120',   manzana: 6,  lote: '12', monto: 5000,  fecha: '2026-09-12' },
  { codigo: 'K121',   manzana: 9,  lote: '34', monto: 10000, fecha: '2026-09-07' },
  { codigo: 'K122',   manzana: 9,  lote: '38', monto: 5000,  fecha: '2026-09-18' },
  { codigo: 'K123',   manzana: 7,  lote: '6',  monto: 10000, fecha: '2026-09-28' },
  { codigo: 'K124',   manzana: 9,  lote: '29', monto: 5000,  fecha: '2026-09-28' },
  { codigo: 'K125',   manzana: 8,  lote: '2',  monto: 14000, fecha: '2026-09-21' },
  { codigo: 'K125',   manzana: 8,  lote: '3',  monto: 14000, fecha: '2026-09-21' },
  { codigo: 'K126',   manzana: 9,  lote: '40', monto: 5000,  fecha: '2026-10-01' },
  { codigo: 'H204',   manzana: 2,  lote: '21', monto: 14250, fecha: '2026-09-21' },
  { codigo: 'H205',   manzana: 2,  lote: '22', monto: 14240, fecha: '2026-09-21' },
  { codigo: 'H206',   manzana: 2,  lote: '23', monto: 14250, fecha: '2026-09-21' },
  { codigo: 'H207',   manzana: 5,  lote: '3',  monto: 11200, fecha: '2026-09-21' },
  { codigo: 'H208',   manzana: 4,  lote: '31', monto: 14240, fecha: '2026-09-28' },
  { codigo: 'H209',   manzana: 1,  lote: '31', monto: 11200, fecha: '2026-09-09' },
  { codigo: 'LCS001', manzana: 1,  lote: '1',  monto: 7500,  fecha: '2026-09-29' },
];

async function main() {
  const categoria = await prisma.expenseCategory.findUniqueOrThrow({ where: { name: 'Asesores' }, select: { id: true } });
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!admin) throw new Error('No hay usuario ADMIN');

  const filas: Array<{ projectId: string; proyecto: string; description: string; monto: number; fecha: string }> = [];
  const errores: string[] = [];

  for (const c of COMISIONES) {
    const contrato = await prisma.contract.findFirst({
      where: { codigoLegado: c.codigo, status: 'ACTIVE' },
      select: { projectId: true, project: { select: { code: true } }, lots: { select: { lot: { select: { manzana: true, lotNumber: true } } } } },
    });
    if (!contrato) { errores.push(`${c.codigo}: no hay contrato activo`); continue; }
    const tieneLote = contrato.lots.some(l => l.lot.manzana === c.manzana && l.lot.lotNumber === c.lote);
    if (!tieneLote) { errores.push(`${c.codigo}: no tiene el lote M${c.manzana}-L${c.lote}`); continue; }
    filas.push({
      projectId: contrato.projectId, proyecto: contrato.project.code,
      description: `Comisión M${c.manzana}-L${c.lote} (${c.codigo})`, monto: c.monto, fecha: c.fecha,
    });
  }

  if (errores.length) {
    console.log('✗ No se escribe nada:\n  ' + errores.join('\n  '));
    process.exitCode = 1;
    return;
  }

  const existentes = await prisma.expense.findMany({
    where: { OR: filas.map(f => ({ projectId: f.projectId, description: f.description })) },
    select: { projectId: true, description: true },
  });
  const ya = new Set(existentes.map(e => `${e.projectId}|${e.description}`));
  const nuevas = filas.filter(f => !ya.has(`${f.projectId}|${f.description}`));

  const porProyecto = new Map<string, number>();
  for (const f of filas) {
    const marca = ya.has(`${f.projectId}|${f.description}`) ? '  (ya existe, se salta)' : '';
    console.log(`${f.proyecto.padEnd(5)} ${f.fecha}  ${f.description.padEnd(28)} $${f.monto.toLocaleString('es-MX')}${marca}`);
    if (!marca) porProyecto.set(f.proyecto, (porProyecto.get(f.proyecto) ?? 0) + f.monto);
  }
  console.log('\nA cargar por proyecto:');
  for (const [p, t] of porProyecto) console.log(`  ${p.padEnd(5)} $${t.toLocaleString('es-MX')}`);
  const total = nuevas.reduce((a, f) => a + f.monto, 0);
  console.log(`  Total ${nuevas.length} comisiones, $${total.toLocaleString('es-MX')}\n`);

  if (!CONFIRM) { console.log('Nada escrito. Repite con --confirm.'); return; }
  if (!nuevas.length) { console.log('Nada que cargar.'); return; }

  const r = await prisma.expense.createMany({
    data: nuevas.map(f => ({
      amount: f.monto, description: f.description, date: new Date(`${f.fecha}T12:00:00Z`),
      projectId: f.projectId, categoryId: categoria.id, createdById: admin.id, descontarEnCorte: true,
    })),
  });
  console.log(`✓ ${r.count} comisiones cargadas, marcadas para descontarse en el próximo corte.`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
