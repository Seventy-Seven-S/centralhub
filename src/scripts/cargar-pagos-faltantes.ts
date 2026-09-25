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
 *
 * `--hoja <nombre>`: no todos los archivos llaman "Ingresos" a su hoja buena.
 * En JSA 3 la autoritativa es "Capturas"; la hoja "Ingresos" de ese archivo
 * está incompleta y usarla daría números absurdos.
 *
 * `--desde AAAA-MM-DD` / `--hasta AAAA-MM-DD`: acota la ventana, para revisar
 * un periodo concreto sin arrastrar huecos viejos que son otra conversación.
 *
 * `--excluir V005,V018`: códigos que NO se tocan. Hace falta porque el archivo
 * del sistema viejo sigue trayendo pagos que aquí se borraron o se movieron a
 * propósito: el de Teresa (V005) que no existió, y el de Guadalupe (V018) que
 * se reacreditó a Guillermo. Sin esto, cada nueva corrida de migración
 * desharía esas correcciones en silencio.
 *
 * Los MONTOS NEGATIVOS nunca se cargan. En las hojas viejas un negativo es un
 * ajuste contable, no dinero que entró: en JSA 3 hay uno de −$96,000 que es la
 * reversa de cuando el contrato B019 se dividió y uno de sus lotes pasó al
 * B062. Crearlo como pago le restaría ese dinero al cliente.
 */
import { PrismaClient, PaymentType, PaymentMethod, PaymentStatus, CuotaStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { aplicarPagoACuotas } from '../services/lib/pagoCuotas';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();
const ARCHIVO = process.argv[2];
const PROYECTO = process.argv[3];
const CONFIRM = process.argv.includes('--confirm');
const iHoja = process.argv.indexOf('--hoja');
const HOJA = iHoja >= 0 ? process.argv[iHoja + 1] : 'Ingresos';
const arg = (nombre: string) => {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DESDE = arg('--desde') ? new Date(`${arg('--desde')}T00:00:00Z`) : undefined;
const HASTA = arg('--hasta') ? new Date(`${arg('--hasta')}T23:59:59Z`) : undefined;
const EXCLUIDOS = new Set(
  (arg('--excluir') ?? '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean),
);

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const fechaDeSerial = (s: number) => new Date(Date.UTC(1899, 11, 30) + Math.round(s * 86400000));

interface PagoArchivo { codigo: string; fecha: Date; tipo: string; concepto: string; monto: number }

function leerIngresos(ruta: string, hoja = HOJA): PagoArchivo[] {
  const wb = XLSX.readFile(ruta);
  const ws = wb.Sheets[hoja];
  if (!ws) throw new Error(`El archivo no tiene una hoja "${hoja}". Tiene: ${wb.SheetNames.join(', ')}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];
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

  const todos = leerIngresos(ARCHIVO);

  // Un negativo en estas hojas es un ajuste contable, no un ingreso. Se reporta
  // y se deja fuera: convertirlo en pago le restaría dinero al cliente.
  const negativos = todos.filter(p => p.monto < 0);
  if (negativos.length) {
    console.log(`\n⚠️  ${negativos.length} renglón(es) con monto NEGATIVO — no se cargan, son ajustes:`);
    for (const n of negativos) {
      console.log(`      ${n.codigo}  ${n.fecha.toISOString().slice(0, 10)}  ${money(n.monto)}  ${n.concepto.slice(0, 40)}`);
    }
  }

  const pagosArchivo = todos.filter(p =>
    p.monto > 0 && (!DESDE || p.fecha >= DESDE) && (!HASTA || p.fecha <= HASTA));
  if (DESDE || HASTA) {
    console.log(`\nVentana: ${DESDE ? DESDE.toISOString().slice(0, 10) : 'inicio'} a ${HASTA ? HASTA.toISOString().slice(0, 10) : 'hoy'} — ${pagosArchivo.length} renglones del archivo`);
  }
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
    if (EXCLUIDOS.has(cod)) {
      console.log(`  ⏭  ${cod}: excluido a mano — sus diferencias con el archivo son correcciones deliberadas`);
      continue;
    }
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

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN (usa --confirm para escribir)'}  ·  hoja "${HOJA}"\n`);
  console.log(`Pagos a cargar: ${faltantes.length} · ${money(round2(faltantes.reduce((s, f) => s + f.p.monto, 0)))}\n`);

  for (const { c, p } of faltantes) {
    console.log(`  ${(c.codigoLegado ?? '').padEnd(6)} ${`${c.client.firstName} ${c.client.lastName}`.slice(0, 30).padEnd(32)} ` +
      `${p.fecha.toISOString().slice(0, 10)}  ${money(p.monto).padStart(12)}  ${p.tipo}`);
  }

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  // Cuántos pagos idénticos (mismo contrato, monto y día) espera el archivo.
  // La comprobación anti-duplicado no puede preguntar "¿existe uno?": un
  // cliente puede pagar dos veces $3,000 el mismo día, y con esa pregunta el
  // segundo nunca se cargaba. Pregunta "¿ya están TODOS los que el archivo
  // espera?" — caso real de B057 en JSA 3.
  const claveIdentica = (contratoId: string, monto: number, fecha: Date) =>
    `${contratoId}|${monto}|${fecha.toISOString().slice(0, 10)}`;
  // Se cuenta sobre TODO el archivo, no sobre los faltantes: si uno de los dos
  // ya se cargó en una corrida anterior, la lista de faltantes trae uno solo y
  // el conteo diría "ya está" para el que aún falta.
  const esperados = new Map<string, number>();
  for (const pa of pagosArchivo) {
    const c = porCodigo.get(pa.codigo);
    if (!c) continue;
    const k = claveIdentica(c.id, pa.monto, pa.fecha);
    esperados.set(k, (esperados.get(k) ?? 0) + 1);
  }

  let ok = 0;
  for (const { c, p } of faltantes) {
    await prisma.$transaction(async tx => {
      // Se relee dentro: si alguien lo capturó a mano entre el dry-run y esto,
      // no se duplica.
      const yaHay = await tx.payment.count({
        where: {
          contractId: c.id, status: PaymentStatus.CONFIRMED,
          amount: { gte: p.monto - 0.5, lte: p.monto + 0.5 },
          paymentDate: {
            gte: new Date(p.fecha.getTime() - 36 * 3600 * 1000),
            lte: new Date(p.fecha.getTime() + 36 * 3600 * 1000),
          },
        },
      });
      const cuantosEspera = esperados.get(claveIdentica(c.id, p.monto, p.fecha)) ?? 1;
      if (yaHay >= cuantosEspera) {
        console.log(`  ⏭  ${c.codigoLegado}: ya están los ${cuantosEspera} que espera el archivo, se omite`);
        return;
      }

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
      const contrato = await tx.contract.findUnique({
        where: { id: c.id },
        select: { totalPrice: true, status: true },
      });
      const balance = round2((contrato?.totalPrice ?? 0) - (agg._sum.amount ?? 0));

      // Un pago migrado puede ser el que liquida el contrato. Sin esto el
      // contrato se quedaba en ACTIVE con saldo cero y nadie se enteraba de
      // que el cliente ya terminó de pagar — pasó con D052 de JSA 4.
      const pendientes = await tx.cuota.count({
        where: { contractId: c.id, status: CuotaStatus.PENDIENTE },
      });
      const liquidado = balance <= 0.01 && pendientes === 0;
      const reevaluable = contrato?.status === 'ACTIVE' || contrato?.status === 'IN_MORA';

      await tx.contract.update({
        where: { id: c.id },
        data: {
          balance,
          ...(liquidado && reevaluable ? { status: 'COMPLETED', moraMonthsCount: 0 } : {}),
        },
      });
      if (liquidado && reevaluable) console.log(`  🎉 ${c.codigoLegado}: liquidado con este pago`);
      ok++;
    });
  }
  console.log(`\n✅ Pagos cargados: ${ok}/${faltantes.length}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
