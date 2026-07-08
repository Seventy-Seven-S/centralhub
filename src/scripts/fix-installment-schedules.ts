/**
 * fix-installment-schedules.ts
 * Recomputa installmentAmount = financiado/plazo y regenera las cuotas de los
 * contratos a plazos cuyo plazo viene de la hoja Códigos. Los contratos SIN
 * plazo en la fuente se OMITEN y se listan en logs/fix-schedules-sin-plazo.csv.
 *
 * NO toca totalPrice ni balance. Deja las cuotas nuevas en PENDIENTE
 * (la reconciliación de pagos se corre aparte con apply-payments-to-cuotas.ts).
 *
 * Uso:
 *   npx tsx src/scripts/fix-installment-schedules.ts            # dry-run
 *   npx tsx src/scripts/fix-installment-schedules.ts --confirm  # escribe
 */
import { PrismaClient, ContractStatus, CuotaStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { buildScheduleAmounts, readPlazosByCodigo, PlazoParsed } from './lib/installments';

const prisma = new PrismaClient();
const BASE = '/Users/miguelmachuca/CentralHub - Proyectos /Actualizaciones/2026-06-30/';
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const mesLabel = (d: Date) => `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;

// Mapa code de proyecto → archivo Excel fuente
const FILE_BY_CODE: Record<string, string> = {
  BET: 'SISTEMA BETANIA.xlsx', MDS: 'SISTEMA Magnolia del Sur.xlsx',
  MON1: 'SISTEMA MONARCA.xlsx', MON2: 'SISTEMA MONARCA II.xlsx',
  PDS: 'SISTEMA PUERTA DEL SOL.xlsx', SAN: 'SISTEMA SANTANDER.xlsx',
  VDB: 'SISTEMA Valle de Bugambilias .xlsx', VDR: 'VALLE DEL ROBLE.xlsx',
  JSA1: 'JSA 1.xlsx', JSA2: 'JSA 2.xlsx', JSA3: 'JSA 3.xlsx', JSA4: 'JSA 4.xlsx',
};

// JSA1-4 excluidos: su historial de pagos en BD está incompleto (los Excel JSA
// no tienen hoja "Ingresos" y los pagos viejos no se capturaron; downPayment=0
// en todos) → el financiado está inflado y la mensualidad derivada saldría mal.
// Se corregirán cuando se repare su historial de pagos.
const EXCLUDED_CODES = new Set(['JSA1', 'JSA2', 'JSA3', 'JSA4']);

async function main() {
  const confirm = process.argv.includes('--confirm');
  const projects = await prisma.project.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } });

  let fixed = 0, skippedNoPlazo = 0, unchanged = 0, skippedJsa = 0;
  const sinPlazo: string[] = ['proyecto,codigo,cliente,totalPrice,financiado,installmentAmount_actual,motivo'];

  for (const proj of projects) {
    const file = proj.code ? FILE_BY_CODE[proj.code] : undefined;
    if (!file) continue;

    // Proyectos excluidos: reportar todos sus contratos y saltar
    if (proj.code && EXCLUDED_CODES.has(proj.code)) {
      const contratosJsa = await prisma.contract.findMany({
        where: { projectId: proj.id, status: { not: ContractStatus.CANCELED }, paymentPlanType: 'INSTALLMENTS' },
        select: { id: true, codigoLegado: true, totalPrice: true, downPayment: true, installmentAmount: true,
          client: { select: { firstName: true, lastName: true } } },
      });
      for (const c of contratosJsa) {
        const cod = (c.codigoLegado ?? '').toUpperCase();
        const financiado = (c.totalPrice ?? 0) - (c.downPayment ?? 0);
        skippedJsa++;
        sinPlazo.push(`${proj.code},${cod},"${c.client?.firstName ?? ''} ${c.client?.lastName ?? ''}",${c.totalPrice},${financiado},${c.installmentAmount},HISTORIAL_PAGOS_INCOMPLETO_JSA`);
      }
      console.log(`${proj.code}: excluido (historial de pagos incompleto) — ${contratosJsa.length} contratos omitidos`);
      continue;
    }

    let plazos: Map<string, PlazoParsed>;
    try { plazos = readPlazosByCodigo(BASE + file); }
    catch (e) { console.log(`${proj.code}: no se pudo leer plazos (${(e as Error).message}) — omitido`); continue; }

    const contratos = await prisma.contract.findMany({
      where: { projectId: proj.id, status: { not: ContractStatus.CANCELED }, paymentPlanType: 'INSTALLMENTS' },
      select: { id: true, codigoLegado: true, totalPrice: true, downPayment: true, installmentAmount: true, installmentCount: true, startDate: true, contractDate: true,
        client: { select: { firstName: true, lastName: true } } },
    });

    for (const c of contratos) {
      const cod = (c.codigoLegado ?? '').toUpperCase();
      const plazo = plazos.get(cod);
      const financiado = (c.totalPrice ?? 0) - (c.downPayment ?? 0);

      // Sin plazo confiable → reportar y omitir
      if (!plazo || plazo.months == null || plazo.months <= 0) {
        skippedNoPlazo++;
        sinPlazo.push(`${proj.code},${cod},"${c.client?.firstName ?? ''} ${c.client?.lastName ?? ''}",${c.totalPrice},${financiado},${c.installmentAmount},SIN_PLAZO_EN_CODIGOS`);
        continue;
      }

      const plazoMeses = plazo.months;
      const amounts = buildScheduleAmounts(financiado, plazoMeses);
      const nuevaMensualidad = amounts[0];

      // ¿ya está bien? (mismo plazo y misma mensualidad base)
      if (c.installmentCount === plazoMeses && Math.abs((c.installmentAmount ?? 0) - nuevaMensualidad) < 0.01) {
        unchanged++;
        continue;
      }

      fixed++;
      console.log(`  ${proj.code}/${cod}: ${c.installmentCount}×${c.installmentAmount} → ${plazoMeses}×${nuevaMensualidad} (financiado ${financiado})`);

      if (!confirm) continue;

      const fechaInicio = c.startDate ?? c.contractDate ?? new Date(0);
      await prisma.$transaction(async (tx) => {
        await tx.cuota.deleteMany({ where: { contractId: c.id } });
        const cuotasData = amounts.map((monto, i) => {
          const fv = new Date(fechaInicio);
          fv.setMonth(fv.getMonth() + i + 1);
          return { contractId: c.id, numeroCuota: i + 1, mes: mesLabel(fv), montoEsperado: monto, montoPagado: 0, fechaVencimiento: fv, status: CuotaStatus.PENDIENTE };
        });
        await tx.cuota.createMany({ data: cuotasData });
        await tx.contract.update({ where: { id: c.id }, data: { installmentAmount: nuevaMensualidad, installmentCount: plazoMeses } });
      }, { timeout: 60000 });
    }
  }

  // Escribir CSV de sin-plazo
  const csvPath = path.join(process.cwd(), 'logs', 'fix-schedules-sin-plazo.csv');
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, sinPlazo.join('\n'), 'utf8');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Modo: ${confirm ? 'ESCRITURA (--confirm)' : 'DRY-RUN'}`);
  console.log(`Contratos corregidos     : ${fixed}`);
  console.log(`Ya estaban bien          : ${unchanged}`);
  console.log(`Sin plazo (omitidos)     : ${skippedNoPlazo}  → ${csvPath}`);
  console.log(`Excluidos JSA (historial incompleto): ${skippedJsa}`);
  console.log('='.repeat(60));
  if (confirm) console.log('\n⚠ Cuotas regeneradas en PENDIENTE. Corre apply-payments-to-cuotas.ts para reconciliar.');

  await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
