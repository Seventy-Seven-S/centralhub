/**
 * reconciliar-contra-archivo.ts
 *
 * Alinea la app con el consolidado que validaron las secretarias, que es LA
 * fuente de verdad.
 *
 * Por qué esto en vez de corregir caso por caso: se verificó contra producción
 * que `balance = totalPrice − pagos` se cumple en 1,245 de 1,249 contratos
 * vivos, y que solo 4 tienen cuotas que no cuadran con su mensualidad. O sea
 * que la app NO calcula mal: hereda un precio equivocado y lo propaga.
 *
 *     precio  →  financiado  →  mensualidad  →  calendario
 *             ↘  balance = precio − pagos
 *
 * Así que se corrige el origen y se recalcula la cadena:
 *   1. Precio y superficie de cada LOTE, desde su fila del archivo.
 *   2. totalPrice del CONTRATO = suma de sus lotes (respetando las filas que
 *      cubren varios lotes vendidos juntos, cuyo precio es del conjunto).
 *   3. financingAmount = totalPrice − downPayment (el enganche NO se toca:
 *      está respaldado por pagos reales, no por el archivo).
 *   4. balance = totalPrice − pagos confirmados.
 *   5. installmentAmount = la mensualidad del archivo, al peso mayor.
 *   6. Calendario: solo se re-tienden las cuotas PENDIENTES; las pagadas
 *      conservan su historia (ver services/lib/retenderPendientes.ts).
 *
 * NO toca: pagos, enganches, ni contratos cancelados o liquidados.
 *
 * Uso:
 *   npx tsx src/scripts/reconciliar-contra-archivo.ts                # dry-run
 *   npx tsx src/scripts/reconciliar-contra-archivo.ts --code VDB
 *   npx tsx src/scripts/reconciliar-contra-archivo.ts --code VDB --confirm
 */
import { PrismaClient, CuotaStatus } from '@prisma/client';
import { leerArchivoMaestro, agruparPorCodigo, alPesoMayor, FilaLote } from './lib/archivoMaestro';
import { retenderPendientes, CuotaExistente } from '../services/lib/retenderPendientes';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');
const CODE = (() => { const i = process.argv.indexOf('--code'); return i >= 0 ? process.argv[i + 1] : undefined; })();
const SOLO = (() => { const i = process.argv.indexOf('--solo'); return i >= 0 ? process.argv[i + 1]?.split(',') : undefined; })();

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const dif = (a: number, b: number) => Math.abs(a - b) > 1;

interface CambioLote { id: string; etiqueta: string; precio?: number; m2?: number; antes: { precio: number; m2: number } }
interface CambioContrato {
  id: string; etiqueta: string;
  totalPrice?: number; financingAmount?: number; balance?: number;
  installmentAmount?: number; installmentCount?: number;
  cuotas?: ReturnType<typeof retenderPendientes>['nuevas'];
  antes: { totalPrice: number; balance: number; installmentAmount: number };
}

async function main() {
  const filas = leerArchivoMaestro();
  const porContrato = agruparPorCodigo(filas);
  const porLote = new Map<string, FilaLote>();
  for (const f of filas) {
    if (f.manzana == null) continue;
    for (const l of f.lotes) porLote.set(`${f.proyecto}|${Number(f.manzana)}|${l}`, f);
  }

  // ── 1. LOTES ──────────────────────────────────────────────────────────────
  const lotes = await prisma.lot.findMany({
    where: CODE ? { project: { code: CODE } } : {},
    select: { id: true, manzana: true, lotNumber: true, areaM2: true, currentPrice: true,
              project: { select: { code: true } } },
  });

  const cambiosLote: CambioLote[] = [];
  for (const l of lotes) {
    const f = porLote.get(`${l.project.code}|${l.manzana}|${l.lotNumber.trim()}`);
    if (!f) continue;
    // Una fila que cubre varios lotes trae el precio del CONJUNTO: asignárselo
    // a cada lote lo duplicaría. Esos lotes se dejan como están.
    const precio = f.vendidoJunto || f.lotes.length > 1 ? undefined
      : (f.precio != null && f.precio > 0 && dif(l.currentPrice, f.precio) ? f.precio : undefined);
    const m2 = f.vendidoJunto || f.lotes.length > 1 ? undefined
      : (f.m2 != null && f.m2 > 0 && dif(l.areaM2, f.m2) ? f.m2 : undefined);
    if (precio === undefined && m2 === undefined) continue;
    cambiosLote.push({
      id: l.id,
      etiqueta: `${l.project.code.padEnd(5)} M${String(l.manzana).padStart(2)}-L${l.lotNumber.padEnd(5)}`,
      precio, m2, antes: { precio: l.currentPrice, m2: l.areaM2 },
    });
  }

  // ── 2. CONTRATOS ──────────────────────────────────────────────────────────
  const contratos = await prisma.contract.findMany({
    where: { status: { in: ['ACTIVE', 'IN_MORA'] }, ...(CODE ? { project: { code: CODE } } : {}) },
    select: {
      id: true, codigoLegado: true, totalPrice: true, downPayment: true, financingAmount: true,
      installmentAmount: true, installmentCount: true, balance: true,
      project: { select: { code: true } },
      client: { select: { firstName: true, lastName: true } },
      cuotas: { select: { numeroCuota: true, montoEsperado: true, montoPagado: true, status: true, fechaVencimiento: true },
                orderBy: { numeroCuota: 'asc' } },
      payments: { where: { status: 'CONFIRMED' }, select: { amount: true } },
      lots: { select: { lot: { select: { manzana: true, lotNumber: true } } } },
    },
  });

  const cambiosContrato: CambioContrato[] = [];
  const omitidos: Record<string, number> = {};
  const omitir = (r: string) => { omitidos[r] = (omitidos[r] ?? 0) + 1; };

  for (const c of contratos) {
    if (SOLO && !SOLO.includes(c.codigoLegado ?? '')) continue;
    const a = porContrato.get(`${c.project.code}|${(c.codigoLegado ?? '').toUpperCase()}`);
    if (!a) { omitir('no está en el archivo'); continue; }

    // El código por sí solo NO basta para emparejar: hay códigos reutilizados
    // en dos ventas distintas. Caso real (V463): el archivo lo tiene como
    // Marilin en M13-L29 y la app como Dulce María en M1-L11 — aplicarle la
    // fila del archivo le bajó el precio de $450,000 a $280,000. Si ningún
    // lote coincide, no son el mismo contrato aunque compartan código.
    if (c.lots.length && a.lotesRef.size) {
      const coincide = c.lots.some(x => a.lotesRef.has(`${x.lot.manzana}|${x.lot.lotNumber.trim()}`));
      if (!coincide) { omitir('⚠️  código reutilizado: ningún lote coincide — revisar a mano'); continue; }
    }

    const etiqueta = `${c.project.code.padEnd(5)} ${(c.codigoLegado ?? '').padEnd(6)} ` +
      `${`${c.client.firstName} ${c.client.lastName}`.slice(0, 24).padEnd(26)}`;
    const pagado = round2(c.payments.reduce((s, p) => s + p.amount, 0));

    const cambio: CambioContrato = {
      id: c.id, etiqueta,
      antes: { totalPrice: c.totalPrice, balance: c.balance ?? 0, installmentAmount: c.installmentAmount ?? 0 },
    };
    let hayAlgo = false;

    // Precio y lo que cuelga de él. Si alguna fila del archivo trae el
    // acumulado en vez del precio de su lote (ver precioSospechoso), el total
    // no es de fiar: se omite el contrato entero en vez de arriesgar subirle
    // el saldo a alguien que no lo debe.
    if (a.precioSospechoso) { omitir('⚠️  precio acumulado en el archivo — revisar a mano'); continue; }
    const precioArch = a.precioTotal;
    let totalPrice = c.totalPrice;
    if (precioArch != null && precioArch > 0 && dif(c.totalPrice, precioArch)) {
      totalPrice = round2(precioArch);
      cambio.totalPrice = totalPrice;
      cambio.financingAmount = round2(totalPrice - c.downPayment);
      hayAlgo = true;
    }

    // El balance se deriva SIEMPRE de los pagos reales, no se arrastra.
    const balance = round2(totalPrice - pagado);
    if (dif(c.balance ?? 0, balance)) { cambio.balance = balance; hayAlgo = true; }

    // Mensualidad del archivo, al peso mayor.
    let mensualidad = c.installmentAmount ?? 0;
    if (a.mensualidad != null && a.lotesSinMensualidad === 0) {
      const nueva = alPesoMayor(a.mensualidad);
      if (dif(mensualidad, nueva)) { mensualidad = nueva; cambio.installmentAmount = nueva; hayAlgo = true; }
    }

    // Calendario: solo si cambió algo que lo afecta y hay saldo por cobrar.
    if (hayAlgo && c.cuotas.length && balance > 0 && mensualidad > 0) {
      const existentes: CuotaExistente[] = c.cuotas.map(q => ({
        numeroCuota: q.numeroCuota, montoEsperado: q.montoEsperado, montoPagado: q.montoPagado ?? 0,
        status: q.status === CuotaStatus.PAGADA ? 'PAGADA' : 'PENDIENTE',
        fechaVencimiento: q.fechaVencimiento,
      }));
      const { conservadas, nuevas } = retenderPendientes(existentes, balance, mensualidad);
      const pendiente = round2(nuevas.reduce((s, q) => s + q.montoEsperado - q.montoPagado, 0));
      if (Math.abs(pendiente - balance) > 1) { omitir('el calendario no cuadraría'); continue; }
      cambio.cuotas = nuevas;
      cambio.installmentCount = conservadas.length + nuevas.length;
    }

    if (hayAlgo) cambiosContrato.push(cambio); else omitir('ya coincide');
  }

  // ── Reporte ───────────────────────────────────────────────────────────────
  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN (usa --confirm para escribir)'}`);
  console.log(`${CODE ? `Proyecto: ${CODE}` : 'Todos los proyectos'}${SOLO ? ` · solo ${SOLO.join(', ')}` : ''}\n`);

  console.log(`LOTES a corregir: ${cambiosLote.length}`);
  for (const l of cambiosLote.slice(0, 25)) {
    const partes = [];
    if (l.precio !== undefined) partes.push(`precio ${money(l.antes.precio)} → ${money(l.precio)}`);
    if (l.m2 !== undefined) partes.push(`m² ${l.antes.m2} → ${l.m2}`);
    console.log(`  ${l.etiqueta} ${partes.join('  ·  ')}`);
  }
  if (cambiosLote.length > 25) console.log(`  … y ${cambiosLote.length - 25} más`);

  console.log(`\nCONTRATOS a corregir: ${cambiosContrato.length}`);
  console.log('Omitidos:');
  for (const [r, n] of Object.entries(omitidos).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${r}`);

  for (const c of cambiosContrato.slice(0, 25)) {
    const partes = [];
    if (c.totalPrice !== undefined) partes.push(`precio ${money(c.antes.totalPrice)} → ${money(c.totalPrice)}`);
    if (c.balance !== undefined) partes.push(`balance ${money(c.antes.balance)} → ${money(c.balance)}`);
    if (c.installmentAmount !== undefined) partes.push(`mens ${money(c.antes.installmentAmount)} → ${money(c.installmentAmount)}`);
    console.log(`  ${c.etiqueta} ${partes.join('  ·  ')}`);
  }
  if (cambiosContrato.length > 25) console.log(`  … y ${cambiosContrato.length - 25} más`);

  const subeBalance = cambiosContrato.filter(c => c.balance !== undefined && c.balance > c.antes.balance);
  const bajaBalance = cambiosContrato.filter(c => c.balance !== undefined && c.balance < c.antes.balance);

  // Estos SIEMPRE se listan completos, sin recortar: es dinero que un cliente
  // real va a ver distinto mañana, y alguien se lo va a tener que explicar.
  if (subeBalance.length) {
    console.log('\n🔴 A ESTOS CLIENTES LES SUBE EL SALDO:');
    for (const c of subeBalance.sort((a, b) => (b.balance! - b.antes.balance) - (a.balance! - a.antes.balance))) {
      console.log(`  ${c.etiqueta} ${money(c.antes.balance)} → ${money(c.balance!)}  (+${money(round2(c.balance! - c.antes.balance))})`);
    }
  }
  if (bajaBalance.length) {
    console.log('\n🟢 A ESTOS LES BAJA:');
    for (const c of bajaBalance.sort((a, b) => (a.balance! - a.antes.balance) - (b.balance! - b.antes.balance))) {
      console.log(`  ${c.etiqueta} ${money(c.antes.balance)} → ${money(c.balance!)}  (−${money(round2(c.antes.balance - c.balance!))})`);
    }
  }
  console.log(`\n⚠️  A ${subeBalance.length} clientes les SUBE el saldo (total ${money(round2(subeBalance.reduce((s, c) => s + (c.balance! - c.antes.balance), 0)))})`);
  console.log(`    A ${bajaBalance.length} clientes les BAJA el saldo (total ${money(round2(bajaBalance.reduce((s, c) => s + (c.antes.balance - c.balance!), 0)))})`);

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  for (const l of cambiosLote) {
    await prisma.lot.update({
      where: { id: l.id },
      data: {
        ...(l.precio !== undefined ? { currentPrice: l.precio, basePrice: l.precio } : {}),
        ...(l.m2 !== undefined ? { areaM2: l.m2 } : {}),
      },
    });
  }
  console.log(`✅ Lotes actualizados: ${cambiosLote.length}`);

  let ok = 0;
  for (const c of cambiosContrato) {
    await prisma.$transaction(async tx => {
      if (c.cuotas) {
        await tx.cuota.deleteMany({ where: { contractId: c.id, status: { not: CuotaStatus.PAGADA } } });
        if (c.cuotas.length) {
          await tx.cuota.createMany({
            data: c.cuotas.map(q => ({
              contractId: c.id, numeroCuota: q.numeroCuota, mes: q.mes,
              montoEsperado: q.montoEsperado, montoPagado: q.montoPagado,
              fechaVencimiento: q.fechaVencimiento,
              status: q.status === 'PAGADA' ? CuotaStatus.PAGADA : CuotaStatus.PENDIENTE,
            })),
          });
        }
      }
      await tx.contract.update({
        where: { id: c.id },
        data: {
          ...(c.totalPrice !== undefined ? { totalPrice: c.totalPrice } : {}),
          ...(c.financingAmount !== undefined ? { financingAmount: c.financingAmount } : {}),
          ...(c.balance !== undefined ? { balance: c.balance } : {}),
          ...(c.installmentAmount !== undefined ? { installmentAmount: c.installmentAmount } : {}),
          ...(c.installmentCount !== undefined ? { installmentCount: c.installmentCount } : {}),
        },
      });
    });
    ok++;
    if (ok % 50 === 0) console.log(`  …${ok}/${cambiosContrato.length}`);
  }
  console.log(`✅ Contratos actualizados: ${ok}/${cambiosContrato.length}\n`);
}

main().catch(e => { console.error('❌', e); process.exit(1); }).finally(() => prisma.$disconnect());
