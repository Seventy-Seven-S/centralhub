/**
 * cuadrar-calendarios.ts
 *
 * Re-tiende el calendario de los contratos donde lo pendiente no suma el
 * balance. No toca precio, enganche, balance ni pagos: el balance es la
 * verdad (se deriva de los pagos reales) y el calendario tiene que reflejarlo.
 *
 * Tres causas encontradas en producción, las tres se arreglan igual:
 *   · Calendarios con todas las cuotas en $0 porque el contrato tenía
 *     mensualidad 0 cuando se generaron (H026, H132, H133).
 *   · Plazo que no corresponde a la mensualidad: $4,940 × 60 = $296,400
 *     cuando el financiado es $414,922 (G045). El plazo se deriva.
 *   · Residuos de redondeo de $79-$147, de multiplicar una mensualidad
 *     redondeada por el plazo sin que la última cuota absorbiera la
 *     diferencia.
 *
 * Las cuotas PAGADAS no se tocan (ver services/lib/retenderPendientes.ts):
 * su monto y su fecha son historia, y alterarlas inventaría mora.
 *
 * La mensualidad sale del archivo consolidado; si el contrato no está ahí, se
 * usa la suya. Si no hay ninguna, se omite y se reporta.
 *
 * Uso:
 *   npx tsx src/scripts/cuadrar-calendarios.ts             # dry-run
 *   npx tsx src/scripts/cuadrar-calendarios.ts --code SAN
 *   npx tsx src/scripts/cuadrar-calendarios.ts --confirm
 */
import { PrismaClient, CuotaStatus } from '@prisma/client';
import { leerArchivoMaestro, agruparPorCodigo, alPesoMayor } from './lib/archivoMaestro';
import { retenderPendientes, CuotaExistente } from '../services/lib/retenderPendientes';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');
const CODE = (() => { const i = process.argv.indexOf('--code'); return i >= 0 ? process.argv[i + 1] : undefined; })();

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

async function main() {
  const archivo = agruparPorCodigo(leerArchivoMaestro());

  const contratos = await prisma.contract.findMany({
    where: { status: { in: ['ACTIVE', 'IN_MORA'] }, ...(CODE ? { project: { code: CODE } } : {}) },
    select: {
      id: true, codigoLegado: true, balance: true, installmentAmount: true, installmentCount: true,
      financingAmount: true, startDate: true,
      project: { select: { code: true } },
      client: { select: { firstName: true, lastName: true } },
      cuotas: { select: { numeroCuota: true, montoEsperado: true, montoPagado: true, status: true, fechaVencimiento: true },
                orderBy: { numeroCuota: 'asc' } },
      lots: { select: { lot: { select: { manzana: true, lotNumber: true } } } },
    },
  });

  const plan: Array<{
    id: string; etiqueta: string; balance: number; mens: number;
    antes: { n: number; pendiente: number }; despues: { n: number; pendiente: number };
    cuotas: ReturnType<typeof retenderPendientes>['nuevas']; conservadas: number;
  }> = [];
  const omitidos: Record<string, number> = {};
  const omitir = (r: string) => { omitidos[r] = (omitidos[r] ?? 0) + 1; };

  for (const c of contratos) {
    const balance = round2(c.balance ?? 0);
    const pendiente = round2(c.cuotas.reduce((s, q) => s + q.montoEsperado - (q.montoPagado ?? 0), 0));
    if (Math.abs(pendiente - balance) <= 1) { omitir('ya cuadra'); continue; }
    if (balance <= 0) { omitir('sin saldo por cobrar'); continue; }
    if (!c.cuotas.length) { omitir('sin calendario (usar generate-missing-cuotas)'); continue; }

    // Mismo cuidado que en reconciliar-contra-archivo: hay códigos reutilizados
    // en dos ventas distintas (V463). Si ningún lote coincide, la fila del
    // archivo NO es de este contrato y su mensualidad no aplica.
    const bruto = archivo.get(`${c.project.code}|${(c.codigoLegado ?? '').toUpperCase()}`);
    const mismoContrato = !bruto || !c.lots.length || !bruto.lotesRef.size
      || c.lots.some(x => bruto.lotesRef.has(`${x.lot.manzana}|${x.lot.lotNumber.trim()}`));
    const a = mismoContrato ? bruto : undefined;

    const mens = a?.mensualidad != null && a.lotesSinMensualidad === 0
      ? alPesoMayor(a.mensualidad)
      : (c.installmentAmount ?? 0);
    if (!(mens > 0)) { omitir('sin mensualidad ni en el contrato ni en el archivo'); continue; }

    const existentes: CuotaExistente[] = c.cuotas.map(q => ({
      numeroCuota: q.numeroCuota, montoEsperado: q.montoEsperado, montoPagado: q.montoPagado ?? 0,
      status: q.status === CuotaStatus.PAGADA ? 'PAGADA' : 'PENDIENTE',
      fechaVencimiento: q.fechaVencimiento,
    }));
    const { conservadas, nuevas } = retenderPendientes(existentes, balance, mens);
    const nuevoPendiente = round2(nuevas.reduce((s, q) => s + q.montoEsperado - q.montoPagado, 0));
    if (Math.abs(nuevoPendiente - balance) > 1) { omitir('no se logra cuadrar'); continue; }

    plan.push({
      id: c.id,
      etiqueta: `${c.project.code.padEnd(5)} ${(c.codigoLegado ?? '').padEnd(6)} ${`${c.client.firstName} ${c.client.lastName}`.slice(0, 24).padEnd(26)}`,
      balance, mens,
      antes: { n: c.cuotas.length, pendiente },
      despues: { n: conservadas.length + nuevas.length, pendiente: nuevoPendiente },
      cuotas: nuevas, conservadas: conservadas.length,
    });
  }

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN (usa --confirm para escribir)'}\n`);
  console.log(`Contratos a cuadrar: ${plan.length}`);
  console.log('Omitidos:');
  for (const [r, n] of Object.entries(omitidos).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${r}`);

  console.log('\nMuestra:');
  for (const p of plan.sort((a, b) => Math.abs(b.antes.pendiente - b.balance) - Math.abs(a.antes.pendiente - a.balance)).slice(0, 15)) {
    console.log(`  ${p.etiqueta} balance ${money(p.balance).padStart(13)} · pendiente ${money(p.antes.pendiente).padStart(13)} → ${money(p.despues.pendiente).padStart(13)}  ` +
      `· cuotas ${p.antes.n} → ${p.despues.n} (${p.conservadas} pagadas intactas) · mens ${money(p.mens)}`);
  }

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  let ok = 0;
  for (const p of plan) {
    await prisma.$transaction(async tx => {
      await tx.cuota.deleteMany({ where: { contractId: p.id, status: { not: CuotaStatus.PAGADA } } });
      if (p.cuotas.length) {
        await tx.cuota.createMany({
          data: p.cuotas.map(q => ({
            contractId: p.id, numeroCuota: q.numeroCuota, mes: q.mes,
            montoEsperado: q.montoEsperado, montoPagado: q.montoPagado,
            fechaVencimiento: q.fechaVencimiento,
            status: q.status === 'PAGADA' ? CuotaStatus.PAGADA : CuotaStatus.PENDIENTE,
          })),
        });
      }
      await tx.contract.update({
        where: { id: p.id },
        data: { installmentAmount: p.mens, installmentCount: p.despues.n },
      });
    });
    ok++;
    if (ok % 25 === 0) console.log(`  …${ok}/${plan.length}`);
  }
  console.log(`\n✅ Calendarios cuadrados: ${ok}/${plan.length}\n`);
}

main().catch(e => { console.error('❌', e); process.exit(1); }).finally(() => prisma.$disconnect());
