/**
 * auditoria-pagos.ts — SOLO LECTURA
 *
 * Compara los pagos que la app tiene de Santander contra la hoja "Ingresos"
 * del archivo SISTEMA SANTANDER, que es donde las secretarias registran cada
 * cobro con su fecha.
 *
 * Hace DOS chequeos independientes:
 *   1. Pago por pago: cuáles del archivo no están en la app.
 *   2. Contra el "Directorio": el total pagado y el balance por cliente.
 *
 * El segundo atrapa lo que el primero no ve — un pago que sí está pero con
 * monto distinto empareja mal y no aparece como faltante, pero descuadra el
 * total.
 *
 * Empareja por (código, fecha, monto) con tolerancia de un día, porque la
 * fecha del archivo es el momento en que se capturó el recibo y la de la app
 * es la fecha del pago — pueden diferir por horas.
 *
 * Uso:
 *   npx tsx src/scripts/auditoria-pagos.ts <ruta.xlsx> <CODIGO_PROYECTO>
 *   npx tsx src/scripts/auditoria-pagos.ts <ruta.xlsx> SAN --codigo H039
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();
const ARCHIVO = process.argv[2];
const PROYECTO = process.argv[3];
const CODIGO = (() => { const i = process.argv.indexOf('--codigo'); return i >= 0 ? process.argv[i + 1]?.toUpperCase() : undefined; })();

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const soloFecha = (d: Date) => d.toISOString().slice(0, 10);

/** Serial de Excel → Date. Excel cuenta días desde 1899-12-30. */
function fechaDeSerial(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000));
}

interface PagoArchivo {
  codigo: string;
  fecha: Date;
  tipo: string;
  concepto: string;
  monto: number;
  fila: number;
}

function leerIngresos(ruta: string): PagoArchivo[] {
  const wb = XLSX.readFile(ruta);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Ingresos'], { header: 1, defval: null }) as any[][];
  // El encabezado está en la fila 1: Marca temporal | Código | Tipo | Concepto | Monto | …
  const out: PagoArchivo[] = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const serial = Number(r[0]);
    const codigo = String(r[1] ?? '').trim().toUpperCase();
    const monto = Number(r[4]);
    if (!codigo || !Number.isFinite(serial) || !Number.isFinite(monto)) continue;
    // Monto 0 = fila de relleno (H000 "Primera Fila"), no es un cobro.
    if (monto === 0) continue;
    out.push({
      codigo, fecha: fechaDeSerial(serial),
      tipo: String(r[2] ?? '').trim(),
      concepto: String(r[3] ?? '').trim(),
      monto, fila: i + 1,
    });
  }
  return out;
}

/** Código → { pagado, balance } de la hoja Directorio. */
function leerDirectorio(ruta: string): Map<string, { pagado: number | null; balance: number | null }> {
  const wb = XLSX.readFile(ruta);
  const hoja = wb.Sheets['Directorio'];
  const out = new Map<string, { pagado: number | null; balance: number | null }>();
  if (!hoja) return out;

  const rows = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null }) as any[][];
  // El encabezado no siempre está en la misma fila: se busca el que tenga "Código".
  let h = -1;
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    if ((rows[i] ?? []).some(c => String(c ?? '').trim().toLowerCase().startsWith('c\u00f3digo'))) { h = i; break; }
  }
  if (h < 0) return out;

  const hd = (rows[h] ?? []).map(c => String(c ?? '').trim().toLowerCase());
  const cCod = hd.findIndex(s => s.startsWith('c\u00f3digo'));
  const cPagado = hd.findIndex(s => s === 'pagado');
  const cBalance = hd.findIndex(s => s === 'balance');

  for (const r of rows.slice(h + 1)) {
    const cod = String(r?.[cCod] ?? '').trim().toUpperCase();
    if (!cod) continue;
    const num = (v: any) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
    out.set(cod, {
      pagado: cPagado >= 0 ? num(r[cPagado]) : null,
      balance: cBalance >= 0 ? num(r[cBalance]) : null,
    });
  }
  return out;
}

async function main() {
  if (!ARCHIVO || !PROYECTO) throw new Error('Uso: auditoria-pagos.ts <archivo.xlsx> <CODIGO_PROYECTO> [--codigo XXX]');
  const pagosArchivo = leerIngresos(ARCHIVO).filter(p => !CODIGO || p.codigo === CODIGO);

  const contratos = await prisma.contract.findMany({
    where: { project: { code: PROYECTO }, ...(CODIGO ? { codigoLegado: CODIGO } : {}) },
    select: {
      codigoLegado: true, status: true, balance: true, totalPrice: true,
      client: { select: { firstName: true, lastName: true } },
      payments: { where: { status: 'CONFIRMED' }, select: { amount: true, paymentDate: true, concept: true } },
    },
  });
  const porCodigo = new Map(contratos.map(c => [c.codigoLegado ?? '', c]));

  // Agrupar los del archivo por código.
  const archivoPorCodigo = new Map<string, PagoArchivo[]>();
  for (const p of pagosArchivo) {
    (archivoPorCodigo.get(p.codigo) ?? archivoPorCodigo.set(p.codigo, []).get(p.codigo)!).push(p);
  }

  console.log(`\n${'━'.repeat(90)}\n${PROYECTO}  ·  archivo: ${pagosArchivo.length} pagos  ·  app: ${contratos.length} contratos\n${'━'.repeat(90)}`);

  let totalFaltantes = 0, totalMonto = 0;
  const conFaltantes: Array<{ cod: string; cliente: string; faltan: PagoArchivo[]; enApp: number; enArchivo: number }> = [];

  for (const [cod, pagos] of [...archivoPorCodigo].sort()) {
    const c = porCodigo.get(cod);
    if (!c) continue;   // códigos del archivo que no existen como contrato

    const enApp = [...c.payments];
    const faltan: PagoArchivo[] = [];

    for (const pa of pagos) {
      // Empareja por monto y fecha (±1 día). Se consume la coincidencia para
      // que dos pagos iguales del mismo mes no se emparejen con uno solo.
      const idx = enApp.findIndex(pd =>
        Math.abs(pd.amount - pa.monto) < 0.5 &&
        Math.abs(pd.paymentDate.getTime() - pa.fecha.getTime()) <= 36 * 3600 * 1000,
      );
      if (idx >= 0) enApp.splice(idx, 1);
      else faltan.push(pa);
    }

    if (faltan.length) {
      totalFaltantes += faltan.length;
      totalMonto += faltan.reduce((s, p) => s + p.monto, 0);
      conFaltantes.push({
        cod, cliente: `${c.client.firstName} ${c.client.lastName}`,
        faltan, enApp: c.payments.length, enArchivo: pagos.length,
      });
    }
  }

  // ── Chequeo independiente: el Directorio del archivo ─────────────────────
  const dir = leerDirectorio(ARCHIVO);
  const descuadres: Array<{ cod: string; cliente: string; appPagado: number; dirPagado: number }> = [];
  for (const [cod, d] of dir) {
    const c = porCodigo.get(cod);
    if (!c || d.pagado == null) continue;
    const appPagado = round2(c.payments.reduce((s, p) => s + p.amount, 0));
    if (Math.abs(appPagado - d.pagado) > 1) {
      descuadres.push({ cod, cliente: `${c.client.firstName} ${c.client.lastName}`, appPagado, dirPagado: d.pagado });
    }
  }

  console.log('═'.repeat(90));
  console.log(`CONTRATOS CON PAGOS FALTANTES: ${conFaltantes.length}`);
  console.log(`PAGOS FALTANTES: ${totalFaltantes} · ${money(totalMonto)}`);
  console.log('═'.repeat(90));

  for (const f of conFaltantes.sort((a, b) => b.faltan.length - a.faltan.length)) {
    console.log(`\n  ${f.cod}  ${f.cliente.slice(0, 34).padEnd(36)} app ${f.enApp} / archivo ${f.enArchivo}`);
    for (const p of f.faltan) {
      console.log(`     ⚠ ${soloFecha(p.fecha)}  ${money(p.monto).padStart(12)}  ${p.tipo.padEnd(12)} ${p.concepto.slice(0, 30)}  (fila ${p.fila})`);
    }
  }
  // La dirección importa más que el conteo: el Directorio es una FOTO de
  // cuando se actualizó el archivo, así que si la app tiene MÁS es porque hay
  // cobros nuevos posteriores — eso es normal. Si tiene MENOS, falta dinero.
  const appTieneMas   = descuadres.filter(d => d.appPagado > d.dirPagado);
  const appTieneMenos = descuadres.filter(d => d.appPagado < d.dirPagado);
  const faltaTotal = round2(appTieneMenos.reduce((s, d) => s + (d.dirPagado - d.appPagado), 0));

  console.log('\n' + '═'.repeat(90));
  console.log(`DESCUADRES CONTRA EL DIRECTORIO: ${descuadres.length}`);
  console.log(`   app tiene MÁS  (cobros nuevos, normal) ... ${appTieneMas.length}`);
  console.log(`   app tiene MENOS (¡falta dinero!) ......... ${appTieneMenos.length}  ${money(faltaTotal)}`);
  console.log('═'.repeat(90));
  if (appTieneMenos.length) {
    console.log('\n  🔴 LOS QUE FALTAN:');
    for (const d of appTieneMenos.sort((a, b) => (b.dirPagado - b.appPagado) - (a.dirPagado - a.appPagado))) {
      console.log(`     ${d.cod.padEnd(6)} ${d.cliente.slice(0, 30).padEnd(32)} app ${money(d.appPagado).padStart(13)}  directorio ${money(d.dirPagado).padStart(13)}  falta ${money(round2(d.dirPagado - d.appPagado))}`);
    }
  }
  for (const d of descuadres.sort((a, b) => Math.abs(b.appPagado - b.dirPagado) - Math.abs(a.appPagado - a.dirPagado)).slice(0, 20)) {
    const delta = round2(d.appPagado - d.dirPagado);
    console.log(`  ${d.cod.padEnd(6)} ${d.cliente.slice(0, 30).padEnd(32)} app ${money(d.appPagado).padStart(13)}  directorio ${money(d.dirPagado).padStart(13)}  (${delta > 0 ? '+' : ''}${money(delta)})`);
  }
  if (descuadres.length > 20) console.log(`  … y ${descuadres.length - 20} más`);
  console.log();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
