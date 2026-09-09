/**
 * reporte-mensualidades.ts — SOLO LECTURA
 *
 * Compara la mensualidad de cada contrato vivo contra el archivo maestro de
 * las secretarias, aplicando la regla del negocio: el monto del archivo,
 * redondeado al peso mayor inmediato (4570.15 → 4571), porque los clientes
 * pagan en efectivo y nadie paga con centavos.
 *
 * No escribe nada. Sirve para dimensionar el P9 y decidir antes de tocar.
 *
 * Uso:
 *   npx tsx src/scripts/reporte-mensualidades.ts
 *   npx tsx src/scripts/reporte-mensualidades.ts --code VDR --detalle
 */
import { PrismaClient } from '@prisma/client';
import { leerArchivoMaestro, agruparPorCodigo, alPesoMayor } from './lib/archivoMaestro';

const prisma = new PrismaClient();
const CODE = (() => { const i = process.argv.indexOf('--code'); return i >= 0 ? process.argv[i + 1] : undefined; })();
const DETALLE = process.argv.includes('--detalle');

const money = (n: number | null) => (n === null ? '—' : `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);

type Categoria =
  | 'ya_correcta' | 'solo_redondeo' | 'difiere' | 'sin_dato_archivo'
  | 'no_esta_en_archivo' | 'ambigua' | 'de_contado';

async function main() {
  const archivo = agruparPorCodigo(leerArchivoMaestro());
  console.log(`Archivo maestro: ${archivo.size} contratos en ${new Set([...archivo.values()].map(c => c.proyecto)).size} proyectos\n`);

  const contratos = await prisma.contract.findMany({
    where: { status: { in: ['ACTIVE', 'IN_MORA'] }, ...(CODE ? { project: { code: CODE } } : {}) },
    select: {
      codigoLegado: true, installmentAmount: true, financingAmount: true, balance: true,
      project: { select: { code: true } },
      client: { select: { firstName: true, lastName: true } },
    },
  });

  const cuenta: Record<Categoria, number> = {
    ya_correcta: 0, solo_redondeo: 0, difiere: 0, sin_dato_archivo: 0,
    no_esta_en_archivo: 0, ambigua: 0, de_contado: 0,
  };
  const porProyecto = new Map<string, Record<string, number>>();
  const cambios: Array<{ code: string; codigo: string; bd: number; archivo: number; nuevo: number; cat: Categoria; cliente: string }> = [];

  for (const c of contratos) {
    const code = c.project.code;
    const key = `${code}|${(c.codigoLegado ?? '').toUpperCase()}`;
    const a = archivo.get(key);
    const bd = c.installmentAmount ?? 0;

    let cat: Categoria;
    let nuevo = bd;

    if (!a) cat = 'no_esta_en_archivo';
    else if (a.deContado) cat = 'de_contado';
    else if (a.mensualidad === null && a.lotes > 1) cat = 'ambigua';
    else if (a.mensualidad === null) cat = 'sin_dato_archivo';
    else {
      nuevo = alPesoMayor(a.mensualidad);
      if (Math.abs(bd - nuevo) < 0.005) cat = 'ya_correcta';
      else if (Math.abs(bd - a.mensualidad) < 1) cat = 'solo_redondeo';
      else cat = 'difiere';
    }

    cuenta[cat]++;
    const p = porProyecto.get(code) ?? {};
    p[cat] = (p[cat] ?? 0) + 1;
    porProyecto.set(code, p);

    if ((cat === 'solo_redondeo' || cat === 'difiere') && a?.mensualidad != null) {
      cambios.push({ code, codigo: c.codigoLegado ?? '', bd, archivo: a.mensualidad, nuevo, cat, cliente: `${c.client.firstName} ${c.client.lastName}` });
    }
  }

  console.log(`Contratos vivos analizados: ${contratos.length}\n`);
  console.log('RESUMEN');
  console.log(`  ✅ Ya correcta (coincide con el archivo redondeado) .... ${cuenta.ya_correcta}`);
  console.log(`  🔵 Solo falta redondear (difiere < $1) ................. ${cuenta.solo_redondeo}`);
  console.log(`  🟠 DIFIERE del archivo (más de $1) ..................... ${cuenta.difiere}`);
  console.log(`  ⚪ De contado (sin mensualidad, correcto) .............. ${cuenta.de_contado}`);
  console.log(`  ⚠️  Sin mensualidad en el archivo ....................... ${cuenta.sin_dato_archivo}`);
  console.log(`  ⚠️  Ambigua (varios lotes con montos distintos) ......... ${cuenta.ambigua}`);
  console.log(`  ❓ No aparece en el archivo ............................ ${cuenta.no_esta_en_archivo}`);

  console.log('\nPOR PROYECTO');
  console.log('  code   total  ok  redondeo  DIFIERE  contado  sin_dato  ambigua  no_está');
  for (const [code, p] of [...porProyecto].sort()) {
    const t = Object.values(p).reduce((a, b) => a + b, 0);
    console.log(
      `  ${code.padEnd(6)} ${String(t).padStart(5)} ${String(p.ya_correcta ?? 0).padStart(3)} ` +
      `${String(p.solo_redondeo ?? 0).padStart(9)} ${String(p.difiere ?? 0).padStart(8)} ` +
      `${String(p.de_contado ?? 0).padStart(8)} ${String(p.sin_dato_archivo ?? 0).padStart(9)} ` +
      `${String(p.ambigua ?? 0).padStart(8)} ${String(p.no_esta_en_archivo ?? 0).padStart(8)}`,
    );
  }

  const difieren = cambios.filter(c => c.cat === 'difiere');
  console.log(`\nLos que DIFIEREN de verdad (${difieren.length}) — muestra de 20, ordenados por diferencia:`);
  for (const c of difieren.sort((a, b) => Math.abs(b.nuevo - b.bd) - Math.abs(a.nuevo - a.bd)).slice(0, DETALLE ? 500 : 20)) {
    const d = c.nuevo - c.bd;
    console.log(
      `  ${c.code.padEnd(5)} ${c.codigo.padEnd(6)} ${c.cliente.slice(0, 26).padEnd(28)} ` +
      `BD ${money(c.bd).padStart(13)} → archivo ${money(c.nuevo).padStart(13)}  (${d > 0 ? '+' : ''}${d.toFixed(2)})`,
    );
  }

  const totalMes = cambios.reduce((a, c) => a + (c.nuevo - c.bd), 0);
  console.log(`\nImpacto mensual agregado si se aplica todo: ${totalMes >= 0 ? '+' : ''}${money(Math.abs(totalMes)).replace('$', '$')}`);
  console.log(`Contratos que cambiarían: ${cambios.length}\n`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
