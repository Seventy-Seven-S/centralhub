// src/jobs/mora.job.ts
import cron from 'node-cron';
import { PrismaClient, ContractStatus, CuotaStatus } from '@prisma/client';

const prisma = new PrismaClient();

export async function recalcularMora(): Promise<void> {
  const hoy = new Date();

  // Cuotas vencidas sin pagar agrupadas por contrato
  const vencidas = await prisma.cuota.groupBy({
    by: ['contractId'],
    where: {
      status: CuotaStatus.PENDIENTE,
      fechaVencimiento: { lt: hoy },
    },
    _count: { id: true },
  });

  // Contratos activos/en mora para recalcular
  const contratosAfectados = await prisma.contract.findMany({
    where: {
      status: { in: [ContractStatus.ACTIVE, ContractStatus.IN_MORA] },
    },
    select: { id: true, moraMonthsCount: true },
  });

  const contratosConMora = new Set(vencidas.map(v => v.contractId));
  let actualizados = 0;
  let sinCambio    = 0;

  for (const contrato of contratosAfectados) {
    const entrada  = vencidas.find(v => v.contractId === contrato.id);
    const mora     = entrada ? entrada._count.id : 0;
    const newStatus = mora > 0 ? ContractStatus.IN_MORA : ContractStatus.ACTIVE;

    if (mora === contrato.moraMonthsCount) { sinCambio++; continue; }

    await prisma.contract.update({
      where: { id: contrato.id },
      data: { moraMonthsCount: mora, status: newStatus },
    });
    actualizados++;
  }

  console.log(
    `[mora.job] ${new Date().toISOString()} — ` +
    `contratos actualizados: ${actualizados}, sin cambio: ${sinCambio}, ` +
    `en mora: ${contratosConMora.size}`
  );
}

export function startMoraJob(): void {
  // Corre cada noche a medianoche: 0 0 * * *
  cron.schedule('0 0 * * *', async () => {
    console.log('[mora.job] Iniciando recálculo nocturno de mora...');
    await recalcularMora();
  });
  console.log('[mora.job] Cron registrado — corre cada noche a medianoche');
}
