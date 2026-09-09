/**
 * auditoria-vs-consolidado.ts — SOLO LECTURA
 *
 * Compara TODO lo que la app cree contra el consolidado que validaron las
 * secretarias, que es la fuente de verdad: superficie, precio del lote,
 * precio por m², mensualidad y plazo.
 *
 * Se compara a dos niveles porque los errores viven en niveles distintos:
 *  - LOTE  (lots.areaM2, lots.currentPrice): una fila del archivo = un lote.
 *  - CONTRATO (totalPrice, installmentAmount): suma de sus lotes.
 *
 * Un desfase de precio en el contrato pero no en sus lotes significa que el
 * contrato se capturó mal; al revés, que el lote está mal en el inventario.
 *
 * Uso:
 *   npx tsx src/scripts/auditoria-vs-consolidado.ts
 *   npx tsx src/scripts/auditoria-vs-consolidado.ts --code VDR --detalle
 */
import { PrismaClient } from '@prisma/client';
import { leerArchivoMaestro, agruparPorCodigo, FilaLote } from './lib/archivoMaestro';

const prisma = new PrismaClient();
const CODE = (() => { const i = process.argv.indexOf('--code'); return i >= 0 ? process.argv[i + 1] : undefined; })();
const DETALLE = process.argv.includes('--detalle');
const LIMITE = DETALLE ? 1000 : 12;

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
const pct = (a: number, b: number) => (b === 0 ? Infinity : Math.abs(a - b) / b);

/** Diferencia relevante: más de $1 y más del 0.5%, para no reportar redondeos. */
const diferente = (bd: number, arch: number) => Math.abs(bd - arch) > 1 && pct(bd, arch) > 0.005;

async function main() {
  const filas = leerArchivoMaestro();
  const porContrato = agruparPorCodigo(filas);

  // Índice lote→fila del archivo: proyecto|manzana|lote
  const porLote = new Map<string, FilaLote>();
  for (const f of filas) {
    if (f.manzana == null || f.lote == null) continue;
    porLote.set(`${f.proyecto}|${String(Number(f.manzana))}|${f.lote.trim()}`, f);
  }

  console.log(`\nFuente de verdad: ${filas.length} filas de lote · ${porContrato.size} contratos · ${new Set(filas.map(f => f.proyecto)).size} proyectos\n`);

  // ── NIVEL LOTE ────────────────────────────────────────────────────────────
  const lotes = await prisma.lot.findMany({
    where: CODE ? { project: { code: CODE } } : {},
    select: {
      id: true, manzana: true, lotNumber: true, areaM2: true, currentPrice: true, basePrice: true,
      status: true, project: { select: { code: true } },
    },
  });

  const difM2: any[] = [], difPrecio: any[] = [], sinFila: any[] = [];
  for (const l of lotes) {
    const f = porLote.get(`${l.project.code}|${l.manzana}|${l.lotNumber.trim()}`);
    if (!f) { sinFila.push(l); continue; }
    if (f.m2 != null && diferente(l.areaM2, f.m2)) {
      difM2.push({ ...l, arch: f.m2, delta: l.areaM2 - f.m2 });
    }
    if (f.precio != null && f.precio > 0 && diferente(l.currentPrice, f.precio)) {
      difPrecio.push({ ...l, arch: f.precio, delta: l.currentPrice - f.precio });
    }
  }

  console.log('═'.repeat(78));
  console.log(`LOTES · ${lotes.length} en la app, ${porLote.size} filas en el archivo`);
  console.log('═'.repeat(78));
  console.log(`  Superficie (m²) distinta ......... ${difM2.length}`);
  console.log(`  Precio del lote distinto ......... ${difPrecio.length}`);
  console.log(`  Sin fila en el archivo ........... ${sinFila.length}`);

  if (difM2.length) {
    console.log(`\n── SUPERFICIE distinta (top ${Math.min(LIMITE, difM2.length)} por diferencia) ──`);
    for (const d of difM2.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, LIMITE)) {
      console.log(`  ${d.project.code.padEnd(5)} M${String(d.manzana).padStart(2)}-L${d.lotNumber.padEnd(5)} ` +
        `app ${String(d.areaM2).padStart(10)} m²  archivo ${String(d.arch).padStart(10)} m²  (${d.delta > 0 ? '+' : ''}${d.delta.toFixed(2)})`);
    }
  }

  if (difPrecio.length) {
    console.log(`\n── PRECIO del lote distinto (top ${Math.min(LIMITE, difPrecio.length)}) ──`);
    for (const d of difPrecio.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, LIMITE)) {
      console.log(`  ${d.project.code.padEnd(5)} M${String(d.manzana).padStart(2)}-L${d.lotNumber.padEnd(5)} ` +
        `app ${money(d.currentPrice).padStart(14)}  archivo ${money(d.arch).padStart(14)}  (${d.delta > 0 ? '+' : ''}${money(d.delta)})  ${d.status}`);
    }
  }

  // ── NIVEL CONTRATO ────────────────────────────────────────────────────────
  const contratos = await prisma.contract.findMany({
    where: { status: { in: ['ACTIVE', 'IN_MORA'] }, ...(CODE ? { project: { code: CODE } } : {}) },
    select: {
      codigoLegado: true, totalPrice: true, downPayment: true, financingAmount: true,
      installmentAmount: true, installmentCount: true, balance: true,
      project: { select: { code: true } },
      client: { select: { firstName: true, lastName: true } },
      _count: { select: { lots: true } },
    },
  });

  const difPrecioContrato: any[] = [];
  const plazoImposible: any[] = [];
  for (const c of contratos) {
    const a = porContrato.get(`${c.project.code}|${(c.codigoLegado ?? '').toUpperCase()}`);
    if (!a) continue;

    if (a.precioTotal != null && a.precioTotal > 0 && diferente(c.totalPrice, a.precioTotal)) {
      difPrecioContrato.push({ c, arch: a.precioTotal, delta: c.totalPrice - a.precioTotal, lotesArch: a.lotes });
    }

    // Coherencia interna: financiado ÷ mensualidad debe dar un plazo sensato.
    // Un plazo de más de 10 años delata un precio o una mensualidad mal capturados.
    const mens = a.mensualidad ?? c.installmentAmount ?? 0;
    if (mens > 0 && c.financingAmount > 0) {
      const meses = Math.ceil(c.financingAmount / mens);
      if (meses > 120) plazoImposible.push({ c, mens, meses, arch: a.precioTotal });
    }
  }

  console.log('\n' + '═'.repeat(78));
  console.log(`CONTRATOS VIVOS · ${contratos.length}`);
  console.log('═'.repeat(78));
  console.log(`  Precio total distinto ............ ${difPrecioContrato.length}`);
  console.log(`  Plazo imposible (>10 años) ....... ${plazoImposible.length}   ← precio o mensualidad mal`);

  if (difPrecioContrato.length) {
    console.log(`\n── PRECIO del contrato distinto (top ${Math.min(LIMITE, difPrecioContrato.length)}) ──`);
    for (const d of difPrecioContrato.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, LIMITE)) {
      console.log(`  ${d.c.project.code.padEnd(5)} ${(d.c.codigoLegado ?? '').padEnd(6)} ` +
        `${`${d.c.client.firstName} ${d.c.client.lastName}`.slice(0, 22).padEnd(24)} ` +
        `app ${money(d.c.totalPrice).padStart(13)}  archivo ${money(d.arch).padStart(13)}  ` +
        `(${d.delta > 0 ? '+' : ''}${money(d.delta)})  lotes ${d.c._count.lots}/${d.lotesArch}`);
    }
  }

  if (plazoImposible.length) {
    console.log(`\n── 🔴 PLAZO IMPOSIBLE — el precio o la mensualidad están mal ──`);
    for (const d of plazoImposible.sort((a, b) => b.meses - a.meses).slice(0, LIMITE)) {
      console.log(`  ${d.c.project.code.padEnd(5)} ${(d.c.codigoLegado ?? '').padEnd(6)} ` +
        `${`${d.c.client.firstName} ${d.c.client.lastName}`.slice(0, 22).padEnd(24)} ` +
        `financiado ${money(d.c.financingAmount).padStart(13)} ÷ ${money(d.mens).padStart(11)} = ${String(d.meses).padStart(4)} meses  ` +
        `· precio archivo ${money(d.arch)}`);
    }
  }

  console.log();
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
