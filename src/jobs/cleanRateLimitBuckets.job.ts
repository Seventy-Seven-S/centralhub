// src/jobs/cleanRateLimitBuckets.job.ts
// Limpieza nocturna de tablas que crecen solas:
//   - buckets de rate-limit vencidos (PrismaRateLimitStore). Sin esto la tabla
//     crece con una fila por cada llave (identidad+IP) que intentó autenticarse.
//   - tokens de sesión vencidos o ya rotados. Desde que la rotación los MARCA
//     en vez de borrarlos (para no sacar del sistema a la segunda pestaña),
//     alguien tiene que recogerlos: había usuarias con 38 filas acumuladas.
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function cleanExpiredRateLimitBuckets(): Promise<void> {
  const { count } = await prisma.rateLimitBucket.deleteMany({
    where: { resetTime: { lt: new Date() } },
  });

  console.log(`[cleanRateLimitBuckets.job] ${new Date().toISOString()} — buckets vencidos borrados: ${count}`);
}

/**
 * Borra los tokens de sesión que ya no sirven: vencidos, o rotados hace más
 * de la gracia. Se deja un margen generoso sobre la gracia para no competir
 * con una renovación en curso.
 */
export async function cleanExpiredRefreshTokens(): Promise<void> {
  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { rotatedAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
      ],
    },
  });

  console.log(`[cleanRateLimitBuckets.job] ${new Date().toISOString()} — tokens de sesión borrados: ${count}`);
}

export function startCleanRateLimitBucketsJob(): void {
  // Corre cada noche a las 00:30 (después de mora y liberación de apartados)
  cron.schedule('30 0 * * *', async () => {
    console.log('[cleanRateLimitBuckets.job] Iniciando limpieza nocturna...');
    await cleanExpiredRateLimitBuckets();
    await cleanExpiredRefreshTokens();
  });
  console.log('[cleanRateLimitBuckets.job] Cron registrado — corre cada noche a las 00:30');
}
