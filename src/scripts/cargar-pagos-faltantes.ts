/**
 * cargar-pagos-faltantes.ts
 *
 * Carga a la app los pagos que están en la hoja "Ingresos" del archivo del
 * sistema viejo y que nunca llegaron a la base. Los acredita a sus cuotas con
 * la misma cascada que usa un cobro normal, y recalcula el balance.
 *
 * Origen del hueco: cuando se migró Santander, algunos pagos se capturaron en
 * la hoja DESPUÉS de que se tomó la foto de la migración. Del 1 y 2 de
 * septiembre pasaron unos y otros no.
 *
 * NO manda correo al cliente ni genera notificación: es un respaldo de algo
 * que ya ocurrió hace días, no un cobro nuevo. Mandarle un recibo ahora al
 * cliente lo confundiría.
 *
 * Uso:
 *   npx tsx src/scripts/cargar-pagos-faltantes.ts <archivo.xlsx> SAN            # dry-run
 *   npx tsx src/scripts/cargar-pagos-faltantes.ts <archivo.xlsx> SAN --confirm
 */
import { PrismaClient, PaymentType, PaymentMethod, PaymentStatus, CuotaStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { aplicarPagoACuotas } from '../services/lib/pagoCuotas';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();
const ARCHIVO = process.argv[2];
const PROYECTO = process.argv[3];
const CONFIRM = process.argv.includes('--confirm');

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const fechaDeSerial = (s: number) => new Date(Date.UTC(1899, 11, 30) + Math.round(s * 86400000));

interface PagoArchivo { codigo: string; fecha: Date; tipo: string; concepto: string; monto: number }

function leerIngresos(ruta: string): PagoArchivo[] {
  const wb = XLSX.readFile(ruta);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Ingresos'], { header: 1, defval: null }) as any[][];
  const out: PagoArchivo[] = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const serial = Number(r[0]);
    const codigo = String(r[1] ?? '').trim().toUpperCase();
    const monto = Number(r[4]);
    if (!codigo || !Number.isFinite(serial) || !Number.isFinite(monto) || monto === 0) continue;
    out.push({
      codigo, fecha: fechaDeSerial(serial),
      tipo: String(r[2] ?? '').trim(), concepto: String(r[3] ?? '').trim(), monto,
    });
  }
  return out;
}

async function main() {
  if (!ARCHIVO || !PROYECTO) throw new Error('Uso: cargar-pagos-faltantes.ts <archivo.xlsx> <CODIGO_PROYECTO> [--confirm]');

  const pagosArchivo = leerIngresos(ARCHIVO);
  const contratos = await prisma.contract.findMany({
    where: { project: { code: PROYECTO } },
    select: {
      id: true, codigoLegado: true, clientId: true, contractNumber: true, balance: true,
      client: { select: { firstName: true, lastName: true } },
      payments: { where: { status: PaymentStatus.CONFIRMED }, select: { amount: true, paymentDate: true } },
    },
  });
  const porCodigo = new Map(contratos.map(c => [c.codigoLegado ?? '', c]));

  const faltantes: Array<{ c: (typeof contratos)[number]; p: PagoArchivo }> = [];
  const porCod = new Map<string, PagoArchivo[]>();
  for (const p of pagosArchivo) (porCod.get(p.codigo) ?? porCod.set(p.codigo, []).get(p.codigo)!).push(p);

  for (const [cod, pagos] of porCod) {
    const c = porCodigo.get(cod);
    if (!c) continue;
    const enApp = [...c.payments];
    for (const pa of pagos) {
      // Se consume la coincidencia para que dos pagos iguales del mismo mes no
      // se emparejen ambos con uno solo de la app.
      const idx = enApp.findIndex(pd =>
        Math.abs(pd.amount - pa.monto) < 0.5 &&
        Math.abs(pd.paymentDate.getTime() - pa.fecha.getTime()) <= 36 * 3600 * 1000);
      if (idx >= 0) enApp.splice(idx, 1);
      else faltantes.push({ c, p: pa });
    }
  }

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN (usa --confirm para escribir)'}\n`);
  console.log(`Pagos a cargar: ${faltantes.length} · ${money(round2(faltantes.reduce((s, f) => s + f.p.monto, 0)))}\n`);

  for (const { c, p } of faltantes) {
    console.log(`  ${(c.codigoLegado ?? '').padEnd(6)} ${`${c.client.firstName} ${c.client.lastName}`.slice(0, 30).padEnd(32)} ` +
      `${p.fecha.toISOString().slice(0, 10)}  ${money(p.monto).padStart(12)}  ${p.tipo}`);
  }

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  let ok = 0;
  for (const { c, p } of faltantes) {
    await prisma.$transaction(async tx => {
      // Se relee dentro: si alguien lo capturó a mano entre el dry-run y esto,
      // no se duplica.
      const yaExiste = await tx.payment.findFirst({
        where: {
          contractId: c.id, status: PaymentStatus.CONFIRMED,
          amount: { gte: p.monto - 0.5, lte: p.monto + 0.5 },
          paymentDate: {
            gte: new Date(p.fecha.getTime() - 36 * 3600 * 1000),
            lte: new Date(p.fecha.getTime() + 36 * 3600 * 1000),
          },
        },
      });
      if (yaExiste) { console.log(`  ⏭  ${c.codigoLegado}: ya existía, se omite`); return; }

      const esEnganche = /enganche/i.test(p.tipo);

      await tx.payment.create({
        data: {
          paymentNumber: `MIG-${c.contractNumber}-${p.fecha.getTime()}`,
          contractId: c.id,
          clientId: c.clientId,
          paymentType: esEnganche ? PaymentType.DOWN_PAYMENT : PaymentType.INSTALLMENT,
          paymentMethod: PaymentMethod.CASH,
          amount: p.monto,
          paymentDate: p.fecha,
          concept: p.concepto || 'Mensualidad',
          status: PaymentStatus.CONFIRMED,
          notes: 'Cargado desde el sistema viejo — quedó fuera de la migración',
        },
      });

      // El enganche no entra a la cascada de cuotas (no abona a mensualidades).
      if (!esEnganche) {
        const cuotas = await tx.cuota.findMany({
          where: { contractId: c.id }, orderBy: { numeroCuota: 'asc' },
        });
        const { updates } = aplicarPagoACuotas(
          p.monto, p.fecha,
          cuotas.map(q => ({
            id: q.id, montoEsperado: q.montoEsperado, montoPagado: q.montoPagado ?? 0,
            status: q.status === CuotaStatus.PAGADA ? 'PAGADA' as const : 'PENDIENTE' as const,
          })),
        );
        for (const u of updates) {
          await tx.cuota.update({
            where: { id: u.id },
            data: {
              montoPagado: round2(u.montoPagado),
              status: u.status === 'PAGADA' ? CuotaStatus.PAGADA : CuotaStatus.PENDIENTE,
              ...(u.status === 'PAGADA' ? { fechaPago: p.fecha } : {}),
            },
          });
        }
      }

      // El balance se deriva de los pagos, no se arrastra.
      const agg = await tx.payment.aggregate({
        where: { contractId: c.id, status: PaymentStatus.CONFIRMED },
        _sum: { amount: true },
      });
      const contrato = await tx.contract.findUnique({ where: { id: c.id }, select: { totalPrice: true } });
      await tx.contract.update({
        where: { id: c.id },
        data: { balance: round2((contrato?.totalPrice ?? 0) - (agg._sum.amount ?? 0)) },
      });
      ok++;
    });
  }
  console.log(`\n✅ Pagos cargados: ${ok}/${faltantes.length}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
