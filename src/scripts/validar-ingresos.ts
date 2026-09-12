/**
 * validar-ingresos.ts
 *
 * Contrasta los ingresos del sistema viejo contra los de la app, pago por pago,
 * y explica la diferencia en vez de solo reportarla.
 *
 * La hoja de ingresos del sistema viejo trae, además de los cobros reales,
 * renglones que NO son pagos de un cliente: ajustes negativos, apuntes
 * contables ("ENGANCHES DE LOTES REGRESADOS") y renglones de prueba. Se separan
 * para que el descuadre quede desglosado y se pueda decidir caso por caso.
 *
 * Uso:
 *   npx tsx src/scripts/validar-ingresos.ts "<archivo.xlsx>" <PROYECTO> [--hoja "<nombre>"]
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { extraerPagosDeFila } from './lib/pagosMultiHoja';

const prisma = new PrismaClient();
const ARCHIVO = process.argv[2];
const PROYECTO = process.argv[3];
const HOJA = process.argv.includes('--hoja') ? process.argv[process.argv.indexOf('--hoja') + 1] : null;
/** Archivos con un corte por hoja (JSA 1-4.xlsx): se recorren TODAS. */
const MULTIHOJA = process.argv.includes('--multihoja');

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const fechaDeSerial = (s: number) => new Date(Date.UTC(1899, 11, 30) + Math.round(s * 86400000));
/** Tolerancia de 3 días: la marca temporal del sistema viejo y la fecha
 *  capturada en la app no siempre coinciden al día. */
const TOLERANCIA_MS = 3 * 86400000;

interface PagoArchivo { cod: string; fecha: Date; monto: number; tipo: string; concepto: string }

/** Recorre todas las hojas reconociendo los pagos por su forma. Ver
 *  lib/pagosMultiHoja.ts para el porqué. */
function leerMultiHoja(ruta: string): PagoArchivo[] {
  const wb = XLSX.readFile(ruta);
  const out: PagoArchivo[] = [];
  let conPagos = 0;
  for (const nombre of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: null }) as unknown[][];
    const antes = out.length;
    for (const r of rows) {
      const p = extraerPagosDeFila(r);
      if (p) out.push(p);
    }
    if (out.length > antes) conPagos++;
  }
  console.log(`   ${wb.SheetNames.length} hojas · ${conPagos} con pagos`);
  return out;
}

function leerIngresos(ruta: string, hoja: string | null): PagoArchivo[] {
  const wb = XLSX.readFile(ruta);
  const nombre = hoja ?? wb.SheetNames.find(n => /ingreso/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[nombre];
  if (!ws) throw new Error(`No existe la hoja "${nombre}". Hay: ${wb.SheetNames.join(', ')}`);
  console.log(`   hoja: "${nombre}"`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];
  // Las columnas se ubican por el encabezado cuando existe; si no, se usa el
  // orden que comparten estos archivos: tipo, fecha, código, ?, concepto, monto.
  const iH = rows.findIndex(r => r.some(c => typeof c === 'string' && /tipo de ingreso/i.test(c)));
  let cTipo = 0, cFecha = 1, cCod = 2, cConcepto = 4, cMonto = 5;
  if (iH >= 0) {
    const H = rows[iH].map(c => (typeof c === 'string' ? c.trim().toUpperCase() : ''));
    const b = (re: RegExp, fallback: number) => { const i = H.findIndex(h => re.test(h)); return i >= 0 ? i : fallback; };
    cTipo = b(/TIPO DE INGRESO/, 0); cFecha = b(/MARCA TEMPORAL|FECHA/, 1);
    cCod = b(/C[OÓ]DIGO/, 2); cConcepto = b(/CONCEPTO/, 4); cMonto = b(/MONTO/, 5);
  }

  const out: PagoArchivo[] = [];
  for (const r of rows.slice(iH >= 0 ? iH + 1 : 0)) {
    const tipo = String(r[cTipo] ?? '').trim();
    const cod = String(r[cCod] ?? '').trim().toUpperCase();
    const monto = Number(r[cMonto]);
    const serial = Number(r[cFecha]);
    // Sin tipo o sin código son las filas de totales del pie de la hoja.
    if (!tipo || !cod || !Number.isFinite(monto) || monto === 0 || !Number.isFinite(serial)) continue;
    out.push({ cod, fecha: fechaDeSerial(serial), monto, tipo, concepto: String(r[cConcepto] ?? '') });
  }
  return out;
}

async function main() {
  if (!ARCHIVO || !PROYECTO) throw new Error('Uso: validar-ingresos.ts <archivo.xlsx> <PROYECTO> [--hoja "<nombre>"] [--multihoja]');

  console.log(`\n🔍 Validando ingresos de ${PROYECTO}`);
  const arch = MULTIHOJA ? leerMultiHoja(ARCHIVO) : leerIngresos(ARCHIVO, HOJA);
  const totalArch = arch.reduce((s, x) => s + x.monto, 0);

  const contratos = await prisma.contract.findMany({
    where: { project: { code: PROYECTO } },
    select: { codigoLegado: true, payments: { where: { status: 'CONFIRMED' }, select: { amount: true, paymentDate: true } } },
  });
  const app = new Map<string, Array<{ amount: number; paymentDate: Date }>>();
  for (const c of contratos) app.set(c.codigoLegado ?? '', [...c.payments]);
  const totalApp = contratos.reduce((s, c) => s + c.payments.reduce((a, p) => a + p.amount, 0), 0);
  const nApp = contratos.reduce((s, c) => s + c.payments.length, 0);

  console.log(`\n   archivo: ${String(arch.length).padStart(5)} pagos · ${money(totalArch).padStart(18)}`);
  console.log(`   app:     ${String(nApp).padStart(5)} pagos · ${money(totalApp).padStart(18)}`);
  console.log(`   ${'diferencia:'.padEnd(13)} ${money(totalArch - totalApp).padStart(24)}`);

  // Cada coincidencia se consume: dos pagos iguales del mismo mes no pueden
  // emparejarse ambos con uno solo de la app.
  const faltan: PagoArchivo[] = [], sinContrato: PagoArchivo[] = [];
  for (const a of arch) {
    const lista = app.get(a.cod);
    if (!lista) { sinContrato.push(a); continue; }
    const i = lista.findIndex(p => Math.abs(p.amount - a.monto) < 0.5 &&
      Math.abs(p.paymentDate.getTime() - a.fecha.getTime()) <= TOLERANCIA_MS);
    if (i >= 0) lista.splice(i, 1); else faltan.push(a);
  }
  const sobran = [...app.entries()].flatMap(([cod, ps]) => ps.map(p => ({ cod, ...p })));

  const pendientes = [...faltan, ...sinContrato];
  const negativos = pendientes.filter(x => x.monto < 0);
  const sospechosos = pendientes.filter(x => x.monto > 0 && (!app.has(x.cod) || /prueba|regresad|devuelt|cancelad/i.test(x.cod + x.concepto)));
  const reales = pendientes.filter(x => !negativos.includes(x) && !sospechosos.includes(x));

  const bloque = (titulo: string, xs: PagoArchivo[], nota: string) => {
    if (!xs.length) return;
    console.log(`\n   ${titulo}: ${xs.length} · ${money(xs.reduce((s, x) => s + x.monto, 0))}`);
    console.log(`      ${nota}`);
    for (const x of xs.slice(0, 15))
      console.log(`      ${iso(x.fecha)}  ${x.cod.padEnd(8)} ${money(x.monto).padStart(15)}  ${x.tipo.padEnd(12)} "${x.concepto.slice(0, 42)}"${app.has(x.cod) ? '' : '  ← código inexistente'}`);
    if (xs.length > 15) console.log(`      … y ${xs.length - 15} más`);
  };

  bloque('AJUSTES NEGATIVOS', negativos, 'Restan del total. Si la app no los tiene, el cliente aparece pagando de más.');
  bloque('NO SON COBROS A UN CLIENTE', sospechosos, 'Apuntes contables o renglones de prueba: revisar antes de cargar.');
  bloque('PAGOS QUE FALTAN EN LA APP', reales, 'Cobros reales de un cliente existente que no están migrados.');

  if (sobran.length) {
    console.log(`\n   EN LA APP Y NO EN EL ARCHIVO: ${sobran.length} · ${money(sobran.reduce((s, x) => s + x.amount, 0))}`);
    console.log('      Normal si se cobraron con el sistema nuevo después del corte del archivo.');
    for (const x of sobran.slice(0, 10)) console.log(`      ${iso(x.paymentDate)}  ${x.cod.padEnd(8)} ${money(x.amount).padStart(15)}`);
    if (sobran.length > 10) console.log(`      … y ${sobran.length - 10} más`);
  }

  const explicado = pendientes.reduce((s, x) => s + x.monto, 0) - sobran.reduce((s, x) => s + x.amount, 0);
  console.log(`\n   Suma de lo listado: ${money(explicado)} · diferencia a explicar: ${money(totalArch - totalApp)}`);
  console.log(`   ${Math.abs(explicado - (totalArch - totalApp)) < 0.5 ? '✅ la diferencia queda explicada al peso' : '⚠ queda un residuo sin explicar'}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
