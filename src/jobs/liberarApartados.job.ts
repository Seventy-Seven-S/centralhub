// src/jobs/liberarApartados.job.ts
// Liberación automática de apartados vencidos (spec RF: "liberación automática
// si no se firma"). Los plazos los fija reserveLot al apartar (3 semanas
// hábiles con anticipo / 1 sin) en reservationExpiry; este job barre los
// RESERVED cuya expiración ya pasó y los libera vía releaseReservation, que
// también borra la INE del apartado (fila Document + archivo físico).
import cron from 'node-cron';
import { PrismaClient, LotStatus } from '@prisma/client';
import lotService from '../services/lot.service';
import notificationService from '../services/notification.service';

const prisma = new PrismaClient();

export async function liberarApartadosVencidos(): Promise<void> {
  const vencidos = await prisma.lot.findMany({
    where: {
      status: LotStatus.RESERVED,
      reservationExpiry: { lt: new Date() },
    },
    select: { id: true, manzana: true, lotNumber: true, reservedByName: true },
  });

  let liberados = 0;
  for (const lote of vencidos) {
    try {
      await lotService.releaseReservation(lote.id);
      liberados++;

      // Notificación fire-and-forget: ADMIN (copia de todo) + MANAGER
      try {
        await notificationService.createForAudiences(
          {
            type: 'RESERVATION',
            message: `Apartado vencido liberado: lote ${lote.lotNumber} M${lote.manzana}` +
              (lote.reservedByName ? ` — ${lote.reservedByName}` : ''),
            relatedEntity: 'lot',
            relatedEntityId: lote.id,
          },
          ['ADMIN', 'MANAGER'],
        );
      } catch (err) {
        console.error(`[liberarApartados.job] Error notificando lote ${lote.id}:`, err);
      }
    } catch (err) {
      console.error(`[liberarApartados.job] Error liberando lote ${lote.id}:`, err);
    }
  }

  console.log(
    `[liberarApartados.job] ${new Date().toISOString()} — ` +
    `vencidos: ${vencidos.length}, liberados: ${liberados}`
  );
}

export function startLiberarApartadosJob(): void {
  // Corre cada noche a las 00:15 (después del job de mora de medianoche)
  cron.schedule('15 0 * * *', async () => {
    console.log('[liberarApartados.job] Iniciando barrido de apartados vencidos...');
    await liberarApartadosVencidos();
  });
  console.log('[liberarApartados.job] Cron registrado — corre cada noche a las 00:15');
}
