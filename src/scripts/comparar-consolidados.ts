/**
 * comparar-consolidados.ts — contrasta dos versiones del archivo consolidado.
 *
 * El archivo nuevo llegó pesando menos de la mitad que el anterior. Antes de
 * tomarlo como fuente de verdad hay que saber si adelgazó porque se limpió o
 * porque perdió datos: "corregir" la base con un archivo incompleto sería peor
 * que no tocarla.
 *
 * Uso: npx tsx src/scripts/comparar-consolidados.ts <viejo.xlsx> <nuevo.xlsx>
 */
import * as XLSX from 'xlsx';

const [VIEJO, NUEVO] = process.argv.slice(2);

interface Hoja { lotes: Map<string, Fila>; columnas: string[] }
interface Fila { cod: string; cliente: string; precio: number | null; sup: number | null; mens: number | null; estatus: string }

const num = (v: any) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

function leer(ruta: string): Map<string, Hoja> {
  const wb = XLSX.readFile(ruta);
  const out = new Map<string, Hoja>();
  for (const nombre of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: null }) as any[][];
    // Cada hoja nombra la manzana a su manera: MANZANA, MZA (V.ROBLE) o
    // FRACCION (BETANIA). Buscar solo "MANZANA" dejaba dos hojas sin comparar,
    // y una hoja sin comparar se ve igual que una hoja sin cambios.
    const ES_MANZANA = /^\s*(MANZANA|MZA|FRACCION)\s*$/i;
    const hdr = rows.findIndex(r => r.some(c => typeof c === 'string' && ES_MANZANA.test(String(c))));
    if (hdr < 0) { out.set(nombre.trim(), { lotes: new Map(), columnas: [] }); continue; }
    const H = rows[hdr].map((c: any) => String(c ?? '').trim().toUpperCase());
    const c = (...ns: string[]) => { for (const n of ns) { const i = H.indexOf(n); if (i >= 0) return i; } return -1; };
    const cM = c('MANZANA', 'MZA', 'FRACCION'), cL = c('LOTE'), cSup = c('SUPERFICIE', 'SUPERFICIE M2', 'M2'), cPre = c('PRECIO/VENTA', 'PRECIO POR LOTE', 'PRECIO'),
          cCod = c('CODIGO', 'CODIGO DE CLIENTE', 'CODIGO DE CLIENTE ASIGNADO'), cCli = c('CLIENTE', 'CLIENTE ACTUAL', 'NOMBRE  DE CLIENTE'),
          cMens = c('MENSUALIDAD'), cEst = c('ESTATUS');
    const lotes = new Map<string, Fila>();
    for (const r of rows.slice(hdr + 1)) {
      if (r[cM] === null || r[cL] === null) continue;
      lotes.set(`M${r[cM]}-L${String(r[cL]).trim()}`, {
        cod: String(r[cCod] ?? '').trim().toUpperCase(),
        cliente: String(r[cCli] ?? '').trim(),
        precio: cPre >= 0 ? num(r[cPre]) : null,
        sup: cSup >= 0 ? num(r[cSup]) : null,
        mens: cMens >= 0 ? num(r[cMens]) : null,
        estatus: cEst >= 0 ? String(r[cEst] ?? '').trim() : '',
      });
    }
    out.set(nombre.trim(), { lotes, columnas: H.filter(Boolean) });
  }
  return out;
}

const v = leer(VIEJO), n = leer(NUEVO);
const hojas = [...new Set([...v.keys(), ...n.keys()])];

console.log(`\n${'HOJA'.padEnd(18)} ${'VIEJO'.padStart(6)} ${'NUEVO'.padStart(6)} ${'Δ'.padStart(6)}   perdidos / nuevos`);
console.log('─'.repeat(72));
let totalPerdidos = 0, totalNuevos = 0, totalCambios = 0;
const detalle: string[] = [];

for (const h of hojas) {
  const a = v.get(h)?.lotes ?? new Map(), b = n.get(h)?.lotes ?? new Map();
  const perdidos = [...a.keys()].filter(k => !b.has(k));
  const nuevos = [...b.keys()].filter(k => !a.has(k));
  totalPerdidos += perdidos.length; totalNuevos += nuevos.length;
  console.log(`${h.padEnd(18)} ${String(a.size).padStart(6)} ${String(b.size).padStart(6)} ${String(b.size - a.size).padStart(6)}   -${perdidos.length} / +${nuevos.length}`);
  if (perdidos.length) detalle.push(`  ${h} · YA NO ESTÁN (${perdidos.length}): ${perdidos.slice(0, 12).join(' ')}${perdidos.length > 12 ? ' …' : ''}`);

  // Cambios de dato en los lotes que están en ambos
  const cambios: string[] = [];
  for (const [k, fa] of a) {
    const fb = b.get(k); if (!fb) continue;
    const difs: string[] = [];
    if (fa.cod !== fb.cod) difs.push(`código ${fa.cod || '—'}→${fb.cod || '—'}`);
    if (fa.precio !== null && fb.precio !== null && Math.abs(fa.precio - fb.precio) > 1) difs.push(`precio ${fa.precio}→${fb.precio}`);
    if (fa.sup !== null && fb.sup !== null && Math.abs(fa.sup - fb.sup) > 0.5) difs.push(`m² ${fa.sup}→${fb.sup}`);
    if (fa.mens !== null && fb.mens !== null && Math.abs(fa.mens - fb.mens) > 1) difs.push(`mensualidad ${fa.mens}→${fb.mens}`);
    if (difs.length) cambios.push(`    ${k}: ${difs.join(' · ')}`);
  }
  totalCambios += cambios.length;
  if (cambios.length) detalle.push(`  ${h} · CAMBIOS DE DATO (${cambios.length}):\n${cambios.slice(0, 15).join('\n')}${cambios.length > 15 ? `\n    … y ${cambios.length - 15} más` : ''}`);
}

console.log('─'.repeat(72));
console.log(`${'TOTAL'.padEnd(18)} ${String([...v.values()].reduce((s, x) => s + x.lotes.size, 0)).padStart(6)} ${String([...n.values()].reduce((s, x) => s + x.lotes.size, 0)).padStart(6)}`);
console.log(`\nlotes que desaparecieron: ${totalPerdidos} · lotes nuevos: ${totalNuevos} · lotes con dato cambiado: ${totalCambios}`);
if (detalle.length) console.log('\n' + detalle.join('\n'));
