// El arquitecto pidió quitar las liquidaciones (cortes al dueño) de tres
// proyectos (28-oct-2026):
//  - MON1 y VDB: a sus dueños se les reporta con su propio acceso de SOCIO.
//  - LCS (Los Cisnes): es proyecto del arquitecto, no hay a quién liquidar.
// Se prende sinCortes: ya no se generan liquidaciones, los gastos nuevos no
// se marcan para descontar y el "pendiente por entregar" sale en $0. No se
// borra nada; las liquidaciones que ya existen quedan como historial.
//
//   npx tsx src/scripts/_historico/sin-cortes-mon1-vdb-lcs.ts            (dry-run)
//   npx tsx src/scripts/_historico/sin-cortes-mon1-vdb-lcs.ts --aplicar
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const CODIGOS = ['MON1', 'VDB', 'LCS'];

async function main() {
  console.log(aplicar ? '=== APLICANDO ===' : '=== DRY-RUN (nada se escribe) ===');
  const proyectos = await prisma.project.findMany({
    where: { code: { in: CODIGOS } },
    select: { id: true, code: true, name: true, sinCortes: true, _count: { select: { cortes: true } } },
  });
  if (proyectos.length !== CODIGOS.length) throw new Error(`Se esperaban ${CODIGOS.length} proyectos, hay ${proyectos.length}`);
  for (const p of proyectos) {
    console.log(`  ${p.code.padEnd(5)} ${p.name}: sin cortes ${p.sinCortes} -> true  (${p._count.cortes} liquidaciones se quedan como historial)`);
  }
  if (!aplicar) { console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)'); return; }
  const r = await prisma.project.updateMany({ where: { code: { in: CODIGOS } }, data: { sinCortes: true } });
  console.log(`\n✓ ${r.count} proyectos quedaron sin cortes.`);
}

main().catch(e => { console.error('❌', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
