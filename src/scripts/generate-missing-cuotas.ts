/**
 * generate-missing-cuotas.ts
 *
 * Genera el calendario de los contratos VIVOS (ACTIVE / IN_MORA) que no tienen
 * ninguna cuota. Sin esos contratos las secretarias no pueden cobrar: el guard
 * de payment.service exige cuotas pendientes y el botón de pago no aparece.
 *
 * NO lee Excel. Usa los datos que ya están en el contrato (monto financiado,
 * plazo, tasa, fecha de inicio) y el MISMO generador que usa la app al cobrar
 * (services/lib/calendarioFaltante.ts), así que un contrato reparado aquí
 * queda idéntico al que la app habría generado sola.
 *
 * El histórico ya abonado se pre-aplica en cascada, de modo que el calendario
 * nace cuadrado con el balance del contrato.
 *
 * Uso:
 *   npx tsx src/scripts/generate-missing-cuotas.ts             # dry-run
 *   npx tsx src/scripts/generate-missing-cuotas.ts --confirm   # escribe
 *   npx tsx src/scripts/generate-missing-cuotas.ts --code JSA4 # un proyecto
 */
import { PrismaClient } from '@prisma/client';
import { generarCalendarioFaltante, motivoNoGenerable } from '../services/lib/calendarioFaltante';

const prisma = new PrismaClient();

const CONFIRM = process.argv.includes('--confirm');
const CODE = (() => {
  const i = process.argv.indexOf('--code');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

async function main() {
  const contratos = await prisma.contract.findMany({
    where: {
      status: { in: ['ACTIVE', 'IN_MORA'] },
      cuotas: { none: {} },
      ...(CODE ? { project: { code: CODE } } : {}),
    },
    select: {
      id: true, codigoLegado: true, contractNumber: true, paymentPlanType: true,
      financingAmount: true, installmentCount: true, interestRate: true,
      startDate: true, balance: true,
      project: { select: { code: true } },
      client: { select: { firstName: true, lastName: true } },
      _count: { select: { payments: true } },
    },
    orderBy: [{ project: { code: 'asc' } }, { codigoLegado: 'asc' }],
  });

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN (usa --confirm para escribir)'}`);
  console.log(`Contratos vivos sin ninguna cuota: ${contratos.length}\n`);

  const generables: typeof contratos = [];
  const bloqueados: Array<{ c: (typeof contratos)[number]; motivo: string }> = [];

  for (const c of contratos) {
    const motivo = motivoNoGenerable(c);
    if (motivo) bloqueados.push({ c, motivo });
    else generables.push(c);
  }

  console.log(`✅ Generables ahora: ${generables.length}`);
  for (const c of generables) {
    const rows = generarCalendarioFaltante(c);
    const pagadas = rows.filter(r => r.status === 'PAGADA').length;
    console.log(
      `   ${c.project.code.padEnd(5)} ${(c.codigoLegado ?? c.contractNumber).padEnd(8)} ` +
      `${`${c.client.firstName} ${c.client.lastName}`.slice(0, 28).padEnd(30)} ` +
      `${String(c.installmentCount).padStart(3)} cuotas · financiado ${money(c.financingAmount).padStart(14)} · ` +
      `${pagadas} quedarían PAGADAS por el histórico · ${c._count.payments} pagos previos`,
    );
  }

  if (bloqueados.length) {
    console.log(`\n⛔ Necesitan dato de las secretarias: ${bloqueados.length}`);
    for (const { c, motivo } of bloqueados) {
      console.log(
        `   ${c.project.code.padEnd(5)} ${(c.codigoLegado ?? c.contractNumber).padEnd(8)} ` +
        `${`${c.client.firstName} ${c.client.lastName}`.slice(0, 28).padEnd(30)} → ${motivo}`,
      );
    }
  }

  if (!CONFIRM) {
    console.log('\nNada escrito. Repite con --confirm para aplicar.\n');
    return;
  }

  let escritos = 0;
  for (const c of generables) {
    const rows = generarCalendarioFaltante(c);
    // Una transacción por contrato: si uno falla, no arrastra a los demás.
    await prisma.$transaction(async tx => {
      const yaTiene = await tx.cuota.count({ where: { contractId: c.id } });
      if (yaTiene > 0) return; // alguien cobró mientras corría el script
      await tx.cuota.createMany({ data: rows });
      escritos++;
    });
  }

  console.log(`\n✅ Calendarios escritos: ${escritos}/${generables.length}\n`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
