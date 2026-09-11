/**
 * auditoria-pagos-santander.ts — SOLO LECTURA
 *
 * Compara los pagos que la app tiene de Santander contra la hoja "Ingresos"
 * del archivo SISTEMA SANTANDER, que es donde las secretarias registran cada
 * cobro con su fecha.
 *
 * Reportado por las secretarias: a H039 le faltan agosto y octubre, "y así hay
 * varios". Esto dice cuántos son y cuáles.
 *
 * Empareja por (código, fecha, monto) con tolerancia de un día, porque la
 * fecha del archivo es el momento en que se capturó el recibo y la de la app
 * es la fecha del pago — pueden diferir por horas.
 *
 * Uso:
 *   npx tsx src/scripts/auditoria-pagos-santander.ts <ruta.xlsx>
 *   npx tsx src/scripts/auditoria-pagos-santander.ts <ruta.xlsx> --codigo H039
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();
const ARCHIVO = process.argv[2];
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

async function main() {
  if (!ARCHIVO) throw new Error('Falta la ruta del archivo');
  const pagosArchivo = leerIngresos(ARCHIVO).filter(p => !CODIGO || p.codigo === CODIGO);

  const contratos = await prisma.contract.findMany({
    where: { project: { code: 'SAN' }, ...(CODIGO ? { codigoLegado: CODIGO } : {}) },
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

  console.log(`\nArchivo: ${pagosArchivo.length} pagos · App: ${contratos.length} contratos de Santander\n`);

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
  console.log();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
