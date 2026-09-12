/**
 * migrar-comisiones.ts
 *
 * Carga a Gastos las comisiones de asesores de la hoja "Comisiones" del sistema
 * viejo. Entran en la categoría "Asesores", la misma que ya usan los JSA.
 *
 * La hoja no trae fecha. Cada comisión se fecha con el ENGANCHE del contrato
 * dueño de ese lote: es cuando la venta se cierra y la comisión se gana y se
 * paga. Si el contrato no tiene enganche registrado, se usa su fecha de firma.
 * Un lote sin ninguna de las dos no se carga — inventarle fecha lo metería en
 * el corte equivocado.
 *
 * Idempotente: se identifica por proyecto + fecha + categoría + monto + descripción.
 *
 * Uso:
 *   npx tsx src/scripts/migrar-comisiones.ts "<archivo.xlsx>" SAN            # dry-run
 *   npx tsx src/scripts/migrar-comisiones.ts "<archivo.xlsx>" SAN --confirm
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { leerComisionesDeMatriz } from './lib/comisionesSistemaViejo';
import { leerArchivoMaestro } from './lib/archivoMaestro';

const prisma = new PrismaClient();
const ARCHIVO = process.argv[2];
const PROYECTO = process.argv[3];
/**
 * Dos orígenes distintos porque los archivos son distintos: Santander tiene una
 * hoja "Comisiones" propia (con asesor y recibo), y el archivo maestro trae una
 * columna COMISION por lote. La carga es la misma en ambos casos.
 */
const MAESTRO = process.argv.includes('--maestro');
/** Las comisiones que no se pueden fechar entran como UN solo gasto, para que
 *  el total del proyecto cuadre en vez de quedarse corto. */
const RESTO_JUNTO = process.argv.includes('--resto-junto');
const CATEGORIA = 'Asesores';
const CONFIRM = process.argv.includes('--confirm');
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  if (!ARCHIVO || !PROYECTO) throw new Error('Uso: migrar-comisiones.ts <archivo.xlsx> <PROYECTO> [--maestro] [--confirm]');

  let comisiones: Array<{ manzana: number; lote: string; asesor: string; monto: number }>;
  let enCero: unknown[];
  if (MAESTRO) {
    const filas = leerArchivoMaestro(ARCHIVO, { incluirSinCodigo: true })
      .filter(f => f.proyecto === PROYECTO && f.comision);
    comisiones = filas.flatMap(f => (f.lotes.length ? f.lotes : [f.lote])
      .filter((l): l is string => !!l && !!f.manzana)
      .map(l => ({ manzana: Number(f.manzana), lote: String(l), asesor: '', monto: f.comision! })));
    enCero = [];
  } else {
    const ws = XLSX.readFile(ARCHIVO).Sheets['Comisiones'];
    if (!ws) throw new Error('El archivo no tiene una hoja "Comisiones"');
    const r = leerComisionesDeMatriz(XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]);
    comisiones = r.comisiones; enCero = r.enCero;
  }

  const proyecto = await prisma.project.findFirst({ where: { code: PROYECTO }, select: { id: true } });
  if (!proyecto) throw new Error(`No existe el proyecto ${PROYECTO}`);

  const lots = await prisma.lot.findMany({
    where: { project: { code: PROYECTO } },
    select: {
      manzana: true, lotNumber: true,
      contracts: {
        select: {
          contract: {
            select: {
              codigoLegado: true, startDate: true,
              payments: {
                where: { status: 'CONFIRMED', paymentType: 'DOWN_PAYMENT' },
                select: { paymentDate: true }, orderBy: { paymentDate: 'asc' }, take: 1,
              },
            },
          },
        },
      },
    },
  });
  const porLote = new Map(lots.map(l => [`M${l.manzana}-L${l.lotNumber}`, l]));

  const listos: Array<{ fecha: Date; monto: number; descripcion: string; origen: string }> = [];
  const sinFecha: string[] = [];
  const sinFechaMontos: number[] = [];
  for (const c of comisiones) {
    const ref = `M${c.manzana}-L${c.lote}`;
    const contrato = porLote.get(ref)?.contracts[0]?.contract;
    const fecha = contrato?.payments[0]?.paymentDate ?? contrato?.startDate ?? null;
    if (!fecha) { sinFecha.push(`${ref} (${c.asesor}, ${money(c.monto)})`); sinFechaMontos.push(c.monto); continue; }
    listos.push({
      fecha, monto: c.monto,
      descripcion: `Comisión ${ref}${c.asesor ? ` — ${c.asesor}` : ''}${contrato?.codigoLegado ? ` (${contrato.codigoLegado})` : ''}`,
      origen: contrato?.payments[0] ? 'enganche' : 'firma',
    });
  }

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · comisiones de ${PROYECTO} → categoría "${CATEGORIA}"\n`);
  console.log(`   comisiones con monto: ${comisiones.length} · ${money(comisiones.reduce((s, c) => s + c.monto, 0))}`);
  console.log(`   en cero (no se cargan): ${enCero.length}`);
  console.log(`   fechadas por enganche: ${listos.filter(l => l.origen === 'enganche').length} · por firma: ${listos.filter(l => l.origen === 'firma').length}`);
  if (sinFecha.length) console.log(`   ⚠ SIN FECHA, no se cargan: ${sinFecha.length}\n       ${sinFecha.join('\n       ')}`);
  if (listos.length) console.log(`   periodo: ${iso(new Date(Math.min(...listos.map(l => l.fecha.getTime()))))} → ${iso(new Date(Math.max(...listos.map(l => l.fecha.getTime()))))}`);
  console.log(`\n   a cargar: ${listos.length} · ${money(listos.reduce((s, l) => s + l.monto, 0))}`);

  const existentes = await prisma.expense.findMany({
    where: { projectId: proyecto.id, category: { name: CATEGORIA } },
    select: { date: true, amount: true, description: true },
  });
  const clave = (f: Date, m: number, d: string) => `${iso(f)}|${m.toFixed(2)}|${d}`;
  const yaHay = new Set(existentes.map(e => clave(e.date, Number(e.amount), e.description ?? '')));
  const faltantes = listos.filter(l => !yaHay.has(clave(l.fecha, l.monto, l.descripcion)));
  console.log(`   ya en la base: ${existentes.length} · faltan: ${faltantes.length} · ${money(faltantes.reduce((s, l) => s + l.monto, 0))}\n`);

  // Las que no se pudieron fechar, agrupadas en un solo renglón fechado con la
  // última comisión conocida del proyecto: así el total cuadra y queda claro
  // que es un agregado, no una comisión individual.
  const montoResto = sinFechaMontos.reduce((s, m) => s + m, 0);
  if (RESTO_JUNTO && montoResto > 0) {
    const fechaResto = listos.length
      ? new Date(Math.max(...listos.map(l => l.fecha.getTime())))
      : new Date();
    const desc = `Comisiones sin desglose de fecha (${sinFecha.length} lotes) — ${PROYECTO}`;
    if (!yaHay.has(clave(fechaResto, montoResto, desc))) {
      faltantes.push({ fecha: fechaResto, monto: montoResto, descripcion: desc, origen: 'agrupado' });
      console.log(`   + agrupado: ${money(montoResto)} en 1 renglón (${iso(fechaResto)})`);
    }
  }

  if (!CONFIRM) { console.log('Nada escrito. Repite con --confirm.\n'); return; }
  if (!faltantes.length) { console.log('Nada que cargar.\n'); return; }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!admin) throw new Error('No hay usuario ADMIN');
  const cat = await prisma.expenseCategory.upsert({
    where: { name: CATEGORIA }, update: {}, create: { name: CATEGORIA, createdById: admin.id }, select: { id: true },
  });

  await prisma.expense.createMany({
    data: faltantes.map(l => ({
      projectId: proyecto.id, categoryId: cat.id, amount: l.monto,
      date: l.fecha, createdById: admin.id, description: l.descripcion,
    })),
  });
  console.log(`✅ Cargadas ${faltantes.length} comisiones en ${PROYECTO}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
