/**
 * auditoria-precio-m2.ts — SOLO LECTURA
 *
 * Segunda pasada de la auditoría, sobre lo que la primera dejó abierto:
 *  1. El precio por m² implícito (precio ÷ superficie) en la app vs el archivo.
 *     Un precio/m² fuera de rango delata que el precio o la superficie están
 *     mal, aunque cada uno por separado parezca razonable.
 *  2. Los lotes sin fila en el archivo, desglosados por proyecto y estatus:
 *     inventario no vendido es esperable; un lote VENDIDO sin fila no lo es.
 *  3. Lotes con precio o superficie en CERO, que rompen cualquier cálculo.
 */
import { PrismaClient } from '@prisma/client';
import { leerArchivoMaestro, FilaLote } from './lib/archivoMaestro';

const prisma = new PrismaClient();
const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;

async function main() {
  const filas = leerArchivoMaestro();
  const porLote = new Map<string, FilaLote>();
  for (const f of filas) {
    if (f.manzana == null || f.lote == null) continue;
    porLote.set(`${f.proyecto}|${String(Number(f.manzana))}|${f.lote.trim()}`, f);
  }

  const lotes = await prisma.lot.findMany({
    select: {
      manzana: true, lotNumber: true, areaM2: true, currentPrice: true, basePrice: true,
      status: true, project: { select: { code: true } },
      contracts: { select: { contract: { select: { codigoLegado: true, status: true } } } },
    },
  });

  // ── 1. Precio por m² ──────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(80));
  console.log('PRECIO POR M² — rango por proyecto (solo lotes con ambos datos)');
  console.log('═'.repeat(80));

  const porProyecto = new Map<string, { app: number[]; arch: number[] }>();
  for (const l of lotes) {
    const code = l.project.code;
    const e = porProyecto.get(code) ?? { app: [], arch: [] };
    if (l.areaM2 > 0 && l.currentPrice > 0) e.app.push(l.currentPrice / l.areaM2);
    const f = porLote.get(`${code}|${l.manzana}|${l.lotNumber.trim()}`);
    if (f?.m2 && f.precio && f.m2 > 0 && f.precio > 0) e.arch.push(f.precio / f.m2);
    porProyecto.set(code, e);
  }

  const stats = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return { min: s[0], med: s[Math.floor(s.length / 2)], max: s[s.length - 1], n: s.length };
  };

  console.log('  proy   ── app ($/m²) ──────────────   ── archivo ($/m²) ──────────');
  console.log('          min      mediana      max        min      mediana      max');
  for (const [code, e] of [...porProyecto].sort()) {
    const a = stats(e.app), b = stats(e.arch);
    if (!a && !b) continue;
    const f = (s: any) => s ? `${String(Math.round(s.min)).padStart(7)} ${String(Math.round(s.med)).padStart(10)} ${String(Math.round(s.max)).padStart(9)}` : '      —          —         —';
    console.log(`  ${code.padEnd(6)} ${f(a)}   ${f(b)}`);
  }

  // ── 2. Lotes cuyo precio/m² se sale del rango del proyecto ────────────────
  console.log('\n' + '═'.repeat(80));
  console.log('LOTES CON PRECIO/M² ANÓMALO (más del doble o menos de la mitad de la mediana del proyecto)');
  console.log('═'.repeat(80));
  const medianas = new Map([...porProyecto].map(([c, e]) => [c, stats(e.arch)?.med ?? stats(e.app)?.med ?? 0]));
  const anomalos = lotes
    .filter(l => l.areaM2 > 0 && l.currentPrice > 0)
    .map(l => ({ l, ppm: l.currentPrice / l.areaM2, med: medianas.get(l.project.code) ?? 0 }))
    .filter(x => x.med > 0 && (x.ppm > x.med * 2 || x.ppm < x.med / 2))
    .sort((a, b) => Math.abs(b.ppm / b.med) - Math.abs(a.ppm / a.med));

  console.log(`  Encontrados: ${anomalos.length}`);
  for (const x of anomalos.slice(0, 15)) {
    const f = porLote.get(`${x.l.project.code}|${x.l.manzana}|${x.l.lotNumber.trim()}`);
    console.log(
      `  ${x.l.project.code.padEnd(5)} M${String(x.l.manzana).padStart(2)}-L${x.l.lotNumber.padEnd(5)} ` +
      `${String(x.l.areaM2).padStart(9)} m²  ${money(x.l.currentPrice).padStart(14)}  = ${money(Math.round(x.ppm)).padStart(10)}/m²  ` +
      `(mediana ${money(Math.round(x.med))})  ${f ? `archivo: ${money(f.precio)} / ${f.m2} m²` : 'sin fila'}`,
    );
  }

  // ── 3. Ceros ──────────────────────────────────────────────────────────────
  const ceros = lotes.filter(l => l.areaM2 <= 0 || l.currentPrice <= 0);
  console.log('\n' + '═'.repeat(80));
  console.log(`LOTES CON CERO EN PRECIO O SUPERFICIE · ${ceros.length}`);
  console.log('═'.repeat(80));
  const cerosVendidos = ceros.filter(l => l.status === 'SOLD');
  console.log(`  De ésos, VENDIDOS (los graves): ${cerosVendidos.length}`);
  for (const l of cerosVendidos.slice(0, 15)) {
    const f = porLote.get(`${l.project.code}|${l.manzana}|${l.lotNumber.trim()}`);
    const ctr = l.contracts[0]?.contract;
    console.log(
      `  ${l.project.code.padEnd(5)} M${String(l.manzana).padStart(2)}-L${l.lotNumber.padEnd(5)} ` +
      `m² ${String(l.areaM2).padStart(8)}  precio ${money(l.currentPrice).padStart(12)}  ` +
      `${ctr ? `contrato ${ctr.codigoLegado}` : 'sin contrato'}  ` +
      `${f ? `→ archivo ${money(f.precio)} / ${f.m2} m²` : '· SIN FILA en el archivo'}`,
    );
  }

  // ── 4. Sin fila en el archivo ─────────────────────────────────────────────
  console.log('\n' + '═'.repeat(80));
  console.log('LOTES SIN FILA EN EL ARCHIVO — por proyecto y estatus');
  console.log('═'.repeat(80));
  const sin = new Map<string, Record<string, number>>();
  for (const l of lotes) {
    if (porLote.has(`${l.project.code}|${l.manzana}|${l.lotNumber.trim()}`)) continue;
    const e = sin.get(l.project.code) ?? {};
    e[l.status] = (e[l.status] ?? 0) + 1;
    sin.set(l.project.code, e);
  }
  console.log('  proy    AVAILABLE   SOLD   RESERVED   UNAVAILABLE');
  let vendidosSinFila = 0;
  for (const [code, e] of [...sin].sort()) {
    vendidosSinFila += e.SOLD ?? 0;
    console.log(`  ${code.padEnd(7)} ${String(e.AVAILABLE ?? 0).padStart(9)} ${String(e.SOLD ?? 0).padStart(6)} ` +
      `${String(e.RESERVED ?? 0).padStart(10)} ${String(e.UNAVAILABLE ?? 0).padStart(13)}`);
  }
  console.log(`\n  🔴 Lotes VENDIDOS que no están en el archivo: ${vendidosSinFila}`);
  console.log('     (inventario disponible sin fila es esperable: el archivo lista lo vendido)');
  console.log();
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
