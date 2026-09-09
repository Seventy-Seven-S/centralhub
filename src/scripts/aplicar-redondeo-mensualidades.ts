/**
 * aplicar-redondeo-mensualidades.ts
 *
 * P9: sube la mensualidad al peso mayor inmediato (4570.15 → 4571) tomando el
 * monto del archivo que armaron las secretarias desde los contratos firmados.
 * Los clientes pagan en efectivo y nadie paga con centavos.
 *
 * ALCANCE POR DEFECTO: solo los contratos donde la base y el archivo YA
 * coinciden y lo único que falta son los centavos (diferencia < $1). Los que
 * difieren de verdad requieren revisión caso por caso y se omiten; --todos
 * los incluye, pero eso NO debe usarse sin haber revisado la lista antes.
 *
 * Qué toca: installmentAmount, installmentCount y las cuotas PENDIENTES.
 * Qué NO toca: precio, enganche, financiado, balance, pagos, ni las cuotas ya
 * pagadas — ver services/lib/retenderPendientes.ts para el porqué.
 *
 * Uso:
 *   npx tsx src/scripts/aplicar-redondeo-mensualidades.ts            # dry-run
 *   npx tsx src/scripts/aplicar-redondeo-mensualidades.ts --confirm
 *   npx tsx src/scripts/aplicar-redondeo-mensualidades.ts --code VDR
 */
import { PrismaClient, CuotaStatus } from '@prisma/client';
import { leerArchivoMaestro, agruparPorCodigo, alPesoMayor } from './lib/archivoMaestro';
import { retenderPendientes, CuotaExistente } from '../services/lib/retenderPendientes';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');
const TODOS = process.argv.includes('--todos');
const CODE = (() => { const i = process.argv.indexOf('--code'); return i >= 0 ? process.argv[i + 1] : undefined; })();

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

async function main() {
  const archivo = agruparPorCodigo(leerArchivoMaestro());

  const contratos = await prisma.contract.findMany({
    where: { status: { in: ['ACTIVE', 'IN_MORA'] }, ...(CODE ? { project: { code: CODE } } : {}) },
    select: {
      id: true, codigoLegado: true, installmentAmount: true, installmentCount: true,
      financingAmount: true, balance: true,
      project: { select: { code: true } },
      client: { select: { firstName: true, lastName: true } },
      cuotas: {
        select: { id: true, numeroCuota: true, montoEsperado: true, montoPagado: true, status: true, fechaVencimiento: true },
        orderBy: { numeroCuota: 'asc' },
      },
    },
  });

  const plan: Array<{
    id: string; etiqueta: string; antes: number; despues: number;
    cuotasAntes: number; cuotasDespues: number; conservadas: number;
    nuevas: ReturnType<typeof retenderPendientes>['nuevas'];
  }> = [];
  const omitidos: Record<string, number> = {};
  const omitir = (r: string) => { omitidos[r] = (omitidos[r] ?? 0) + 1; };

  for (const c of contratos) {
    const a = archivo.get(`${c.project.code}|${(c.codigoLegado ?? '').toUpperCase()}`);
    if (!a) { omitir('no está en el archivo'); continue; }
    if (a.mensualidad === null) { omitir('sin mensualidad en el archivo'); continue; }
    if (a.lotesSinMensualidad > 0) { omitir('algún lote sin mensualidad'); continue; }

    const nueva = alPesoMayor(a.mensualidad);
    const bd = c.installmentAmount ?? 0;

    if (Math.abs(bd - nueva) < 0.005) { omitir('ya correcta'); continue; }
    if (!TODOS && Math.abs(bd - a.mensualidad) >= 1) { omitir('difiere del archivo (requiere revisión)'); continue; }
    if (!c.cuotas.length) { omitir('sin calendario'); continue; }

    const balance = round2(c.balance ?? 0);
    if (balance <= 0) { omitir('sin saldo pendiente'); continue; }

    const existentes: CuotaExistente[] = c.cuotas.map(q => ({
      numeroCuota: q.numeroCuota,
      montoEsperado: q.montoEsperado,
      montoPagado: q.montoPagado ?? 0,
      status: q.status === CuotaStatus.PAGADA ? 'PAGADA' : 'PENDIENTE',
      fechaVencimiento: q.fechaVencimiento,
    }));

    const { conservadas, nuevas } = retenderPendientes(existentes, balance, nueva);

    // Guarda dura: lo pendiente tras el cambio debe seguir cuadrando con el
    // balance. Si no, este contrato no se toca.
    const pendienteNuevo = round2(nuevas.reduce((s, q) => s + q.montoEsperado - q.montoPagado, 0));
    if (Math.abs(pendienteNuevo - balance) > 1) { omitir('el calendario no cuadraría con el balance'); continue; }

    plan.push({
      id: c.id,
      etiqueta: `${c.project.code.padEnd(5)} ${(c.codigoLegado ?? '').padEnd(6)} ${`${c.client.firstName} ${c.client.lastName}`.slice(0, 26).padEnd(28)}`,
      antes: bd, despues: nueva,
      cuotasAntes: c.cuotas.length, cuotasDespues: conservadas.length + nuevas.length,
      conservadas: conservadas.length, nuevas,
    });
  }

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN (usa --confirm para escribir)'}`);
  console.log(`${TODOS ? '⚠️  --todos: INCLUYE los que difieren de verdad' : 'Alcance: solo redondeo (diferencia < $1)'}\n`);
  console.log(`Contratos a modificar: ${plan.length}`);
  console.log('\nOmitidos:');
  for (const [r, n] of Object.entries(omitidos).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${r}`);
  }

  const cambiaPlazo = plan.filter(p => p.cuotasAntes !== p.cuotasDespues);
  console.log(`\nA cuántos les cambia el número de cuotas: ${cambiaPlazo.length}`);
  for (const p of cambiaPlazo.slice(0, 10)) {
    console.log(`  ${p.etiqueta} ${p.cuotasAntes} → ${p.cuotasDespues} cuotas`);
  }

  console.log('\nMuestra de 10 cambios:');
  for (const p of plan.slice(0, 10)) {
    console.log(`  ${p.etiqueta} ${money(p.antes).padStart(12)} → ${money(p.despues).padStart(12)}  (${p.conservadas} pagadas intactas, ${p.nuevas.length} re-tendidas)`);
  }

  const subeMes = plan.reduce((a, p) => a + (p.despues - p.antes), 0);
  console.log(`\nSuma de los incrementos mensuales: ${money(round2(subeMes))}`);

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  let ok = 0;
  for (const p of plan) {
    await prisma.$transaction(async tx => {
      // Se borran solo las pendientes; las pagadas ni se tocan.
      await tx.cuota.deleteMany({ where: { contractId: p.id, status: { not: CuotaStatus.PAGADA } } });
      if (p.nuevas.length) {
        await tx.cuota.createMany({
          data: p.nuevas.map(q => ({
            contractId: p.id,
            numeroCuota: q.numeroCuota,
            mes: q.mes,
            montoEsperado: q.montoEsperado,
            montoPagado: q.montoPagado,
            fechaVencimiento: q.fechaVencimiento,
            status: q.status === 'PAGADA' ? CuotaStatus.PAGADA : CuotaStatus.PENDIENTE,
          })),
        });
      }
      await tx.contract.update({
        where: { id: p.id },
        data: { installmentAmount: p.despues, installmentCount: p.cuotasDespues },
      });
    });
    ok++;
    if (ok % 100 === 0) console.log(`  ...${ok}/${plan.length}`);
  }
  console.log(`\n✅ Contratos actualizados: ${ok}/${plan.length}\n`);
}

main().catch(e => { console.error('❌', e); process.exit(1); }).finally(() => prisma.$disconnect());
