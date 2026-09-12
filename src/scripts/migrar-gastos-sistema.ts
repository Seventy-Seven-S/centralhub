/**
 * migrar-gastos-sistema.ts
 *
 * Carga a Gastos la hoja "Gastos" del archivo del sistema viejo de un proyecto
 * (formato un-renglón-por-gasto, distinto al de los archivos "Etapa N" que usa
 * migrar-gastos-etapa.ts).
 *
 * Idempotente: cada gasto se identifica por proyecto + fecha + categoría +
 * monto + concepto, y si ya existe se omite.
 *
 * Uso:
 *   npx tsx src/scripts/migrar-gastos-sistema.ts "<archivo.xlsx>" SAN            # dry-run
 *   npx tsx src/scripts/migrar-gastos-sistema.ts "<archivo.xlsx>" SAN --confirm
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { leerGastosDeMatriz, faltantesContra } from './lib/gastosSistemaViejo';

const prisma = new PrismaClient();
const ARCHIVO = process.argv[2];
const PROYECTO = process.argv[3];
const HOJA = process.argv.includes('--hoja') ? process.argv[process.argv.indexOf('--hoja') + 1] : 'Gastos';
const CONFIRM = process.argv.includes('--confirm');
// Cada proyecto titula la columna del dueño con su apellido; se indica aquí en
// vez de acumular nombres dentro del lector.
const DUENO = process.argv.includes('--dueno') ? process.argv[process.argv.indexOf('--dueno') + 1] : null;
/** Registrar también los renglones sin fecha, heredando la del anterior y
 *  marcándolos para corregirlos después. */
const CON_SIN_FECHA = process.argv.includes('--incluir-sin-fecha');
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  if (!ARCHIVO || !PROYECTO) throw new Error('Uso: migrar-gastos-sistema.ts <archivo.xlsx> <PROYECTO> [--hoja Gastos] [--dueno "Apellido"] [--confirm]');

  const ws = XLSX.readFile(ARCHIVO).Sheets[HOJA];
  if (!ws) throw new Error(`El archivo no tiene una hoja "${HOJA}"`);
  const todas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
  // El encabezado no siempre está en la primera fila (arriba hay un título).
  const iH = todas.findIndex(r => r.some(c => typeof c === 'string' && /^\s*concepto\s*$/i.test(c)));
  if (iH < 0) throw new Error(`No encontré el encabezado (columna "Concepto") en la hoja "${HOJA}"`);

  const { gastos, sinMonto, sinFecha, sinConcepto, sinColumna } = leerGastosDeMatriz(todas.slice(iH), DUENO, { fecharConAnterior: CON_SIN_FECHA });

  const proyecto = await prisma.project.findFirst({ where: { code: PROYECTO }, select: { id: true, name: true } });
  if (!proyecto) throw new Error(`No existe el proyecto ${PROYECTO}`);

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · ${PROYECTO} · hoja "${HOJA}"\n`);

  const porCat = new Map<string, { n: number; monto: number }>();
  for (const g of gastos) {
    const a = porCat.get(g.categoria) ?? { n: 0, monto: 0 };
    a.n++; a.monto += g.monto; porCat.set(g.categoria, a);
  }
  const total = gastos.reduce((s, g) => s + g.monto, 0);
  const fechas = gastos.map(g => g.fecha.getTime());
  const provisionales = gastos.filter(g => g.fechaProvisional);
  console.log(`   gastos legibles: ${gastos.length} · ${money(total)}`);
  if (provisionales.length) {
    console.log(`   ⚠ ${provisionales.length} SIN FECHA en el archivo · ${money(provisionales.reduce((s, g) => s + g.monto, 0))}`);
    console.log(`     Se registran con la fecha del renglón anterior y marcados [FECHA PENDIENTE]:`);
    for (const g of provisionales) console.log(`       ${iso(g.fecha)}  ${money(g.monto).padStart(13)}  "${g.concepto}"`);
  }
  console.log(`   periodo: ${iso(new Date(Math.min(...fechas)))} → ${iso(new Date(Math.max(...fechas)))}\n`);
  for (const [c, v] of [...porCat].sort((a, b) => b[1].monto - a[1].monto))
    console.log(`     ${c.padEnd(22)} ${String(v.n).padStart(4)}  ${money(v.monto).padStart(16)}`);

  // Lo que el archivo trae pero no se puede cargar, a la vista.
  const avisos: string[] = [];
  if (sinFecha.length) avisos.push(`   ⚠ ${sinFecha.length} con monto pero SIN FECHA (no se cargan, irían al periodo equivocado):\n` +
    sinFecha.map(x => `       ${money(x.monto).padStart(14)}  ${x.etiqueta} — "${x.concepto}"`).join('\n'));
  if (sinColumna.length) avisos.push(`   ⚠ ${sinColumna.length} en columna SIN ENCABEZADO (no se cargan):\n` +
    sinColumna.map(x => `       ${money(x.monto).padStart(14)}  col ${x.columna} — "${x.concepto}"`).join('\n'));
  if (sinConcepto.length) avisos.push(`   ⚠ ${sinConcepto.length} con monto pero SIN CONCEPTO (no se cargan):\n` +
    sinConcepto.map(x => `       ${money(x.monto).padStart(14)}  ${x.etiqueta}`).join('\n'));
  if (sinMonto.length) avisos.push(`   ⚠ ${sinMonto.length} con concepto pero SIN MONTO: ${sinMonto.join(', ')}`);
  if (avisos.length) console.log('\n' + avisos.join('\n'));

  const existentes = await prisma.expense.findMany({
    where: { projectId: proyecto.id },
    select: { date: true, amount: true },
  });
  const archivo = ARCHIVO.split('/').pop();
  // La marca va en la descripción, no en una columna nueva: así el gasto se ve
  // y se busca en la pantalla de Gastos tal cual, y al corregir la fecha basta
  // con quitarla. Sin migración de por medio.
  const descripcionDe = (g: { concepto: string; etiqueta: string; fechaProvisional?: boolean }) =>
    `${g.fechaProvisional ? '[FECHA PENDIENTE] ' : ''}${g.concepto} — ${g.etiqueta} (migrado de ${archivo})`;
  // Se compara solo por fecha + monto: el archivo se reedita y entre versiones
  // cambian los nombres de categoría y los conceptos. Ver faltantesContra.
  const faltantes = faltantesContra(gastos, existentes.map(e => ({ date: e.date, amount: Number(e.amount) })));
  console.log(`\n   en la base ya: ${existentes.length} gastos`);
  console.log(`   faltan cargar: ${faltantes.length} · ${money(faltantes.reduce((s, g) => s + g.monto, 0))}\n`);

  if (!CONFIRM) { console.log('Nada escrito. Repite con --confirm.\n'); return; }
  if (!faltantes.length) { console.log('Nada que cargar.\n'); return; }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!admin) throw new Error('No hay usuario ADMIN para atribuir los gastos');

  const cats = new Map<string, string>();
  for (const nombre of new Set(faltantes.map(g => g.categoria))) {
    const c = await prisma.expenseCategory.upsert({
      where: { name: nombre }, update: {}, create: { name: nombre, createdById: admin.id }, select: { id: true },
    });
    cats.set(nombre, c.id);
  }

  await prisma.expense.createMany({
    data: faltantes.map(g => ({
      projectId: proyecto.id,
      categoryId: cats.get(g.categoria)!,
      amount: g.monto,
      date: g.fecha,
      createdById: admin.id,
      // El concepto se conserva tal cual: es lo que el administrador reconoce.
      description: descripcionDe(g),
    })),
  });
  console.log(`✅ Cargados ${faltantes.length} gastos en ${PROYECTO}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
