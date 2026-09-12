/**
 * cargar-inventario-lotes.ts
 *
 * En la migración original solo se cargaron los lotes VENDIDOS. El inventario
 * sin vender nunca entró, así que la app no sabe qué hay disponible: el tablero
 * reporta mal los lotes libres y no se puede cotizar desde el sistema.
 *
 * Este script agrega los lotes que están en el archivo maestro y no en la app.
 * NO modifica ni borra ningún lote existente.
 *
 * Separa dos casos, porque el riesgo es distinto:
 *   - Sin código de cliente → inventario. Se puede crear como AVAILABLE.
 *   - Con código de cliente → es una VENTA que falta. Crear el lote a secas
 *     dejaría un lote "disponible" que en realidad está vendido. Solo se
 *     reporta; necesita contrato y lo revisa una persona.
 *
 * Uso:
 *   npx tsx src/scripts/cargar-inventario-lotes.ts            # dry-run, todos
 *   npx tsx src/scripts/cargar-inventario-lotes.ts SAN PDS    # solo esos
 *   npx tsx src/scripts/cargar-inventario-lotes.ts --confirm
 */
import { PrismaClient } from '@prisma/client';
import { leerArchivoMaestro, type FilaLote } from './lib/archivoMaestro';

const prisma = new PrismaClient();
const ARCHIVO = 'backups/CONSOLIDADO-FUENTE-DE-VERDAD-2026-09-11.xlsx';
/** Betania se cobra con el sistema viejo por instrucción del arquitecto. */
const EXCLUIDOS = new Set(['BET']);
const CONFIRM = process.argv.includes('--confirm');
const SOLO = process.argv.slice(2).filter(a => !a.startsWith('--'));
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const ref = (f: { manzana: string | null; lote: string | null }) => `M${f.manzana}-L${f.lote}`;

async function main() {
  const filas = leerArchivoMaestro(ARCHIVO, { incluirSinCodigo: true });
  const proyectos = await prisma.project.findMany({ select: { id: true, code: true, name: true } });
  const porCodigo = new Map(proyectos.map(p => [p.code, p]));

  const codigos = [...new Set(filas.map(f => f.proyecto))]
    .filter(c => !EXCLUIDOS.has(c))
    .filter(c => !SOLO.length || SOLO.includes(c))
    .sort();

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · inventario de lotes`);
  console.log(`   archivo: ${ARCHIVO}`);
  console.log(`   excluidos: ${[...EXCLUIDOS].join(', ')}\n`);
  console.log('PROY    inventario_a_crear   sin_m2_o_precio   VENTAS_faltantes   ya_en_app');
  console.log('─'.repeat(80));

  let totalCrear = 0, totalIncompletos = 0, totalVentas = 0;
  const aCrear: Array<{ projectId: string; manzana: number; lotNumber: string; areaM2: number; basePrice: number; currentPrice: number }> = [];
  const incompletos: string[] = [];
  const ventasFaltantes: string[] = [];

  for (const code of codigos) {
    const proyecto = porCodigo.get(code);
    if (!proyecto) { console.log(`${code.padEnd(7)} (no existe el proyecto en la app)`); continue; }

    const lots = await prisma.lot.findMany({ where: { projectId: proyecto.id }, select: { manzana: true, lotNumber: true } });
    const enApp = new Set(lots.map(l => `M${l.manzana}-L${l.lotNumber}`));

    let crear = 0, incompleto = 0, venta = 0, existentes = 0;
    const vistos = new Set<string>();

    for (const f of filas.filter(f => f.proyecto === code)) {
      // El archivo repite la fila cuando un lote se vendió junto con otro.
      for (const lote of f.lotes.length ? f.lotes : [f.lote]) {
        const r = `M${f.manzana}-L${lote}`;
        if (!f.manzana || !lote || vistos.has(r)) continue;
        vistos.add(r);
        if (enApp.has(r)) { existentes++; continue; }

        if (f.codigo && f.codigo.trim()) { venta++; ventasFaltantes.push(`${code} ${r} · ${f.codigo} · ${f.cliente ?? ''}`); continue; }
        // areaM2 y precio son obligatorios en la base; sin ellos no se inventa.
        if (!f.m2 || !f.precio) { incompleto++; incompletos.push(`${code} ${r} · m2=${f.m2 ?? '—'} precio=${f.precio ?? '—'}`); continue; }

        crear++;
        aCrear.push({
          projectId: proyecto.id, manzana: Number(f.manzana), lotNumber: String(lote),
          areaM2: f.m2, basePrice: f.precio, currentPrice: f.precio,
        });
      }
    }
    totalCrear += crear; totalIncompletos += incompleto; totalVentas += venta;
    console.log(`${code.padEnd(7)} ${String(crear).padStart(17)} ${String(incompleto).padStart(17)} ${String(venta).padStart(18)} ${String(existentes).padStart(11)}`);
  }

  console.log('─'.repeat(80));
  console.log(`TOTAL   ${String(totalCrear).padStart(17)} ${String(totalIncompletos).padStart(17)} ${String(totalVentas).padStart(18)}`);

  if (ventasFaltantes.length) {
    console.log(`\n⚠ ${ventasFaltantes.length} lotes con CLIENTE que no están en la app — son ventas que faltan, no inventario.`);
    console.log('  No se crean: necesitan contrato y revisión de una persona.');
    ventasFaltantes.slice(0, 15).forEach(v => console.log(`     ${v}`));
    if (ventasFaltantes.length > 15) console.log(`     ... y ${ventasFaltantes.length - 15} más`);
  }
  if (incompletos.length) {
    console.log(`\n⚠ ${incompletos.length} de inventario SIN m² o SIN precio — la base los exige, no se inventan.`);
    incompletos.slice(0, 10).forEach(v => console.log(`     ${v}`));
    if (incompletos.length > 10) console.log(`     ... y ${incompletos.length - 10} más`);
  }
  if (aCrear.length) {
    const sup = aCrear.reduce((s, l) => s + l.areaM2, 0);
    const val = aCrear.reduce((s, l) => s + l.basePrice, 0);
    console.log(`\n   A crear: ${aCrear.length} lotes · ${sup.toLocaleString('es-MX')} m² · ${money(val)} de inventario`);
  }

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }
  if (!aCrear.length) { console.log('\nNada que crear.\n'); return; }

  // createMany con skipDuplicates: si alguien cargó un lote entre el dry-run y
  // esto, no truena ni lo duplica.
  const r = await prisma.lot.createMany({ data: aCrear, skipDuplicates: true });
  console.log(`\n✅ Creados ${r.count} lotes de inventario\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
