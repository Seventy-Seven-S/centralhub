// src/jobs/cleanRateLimitBuckets.job.ts
// Limpieza de buckets de rate-limit vencidos (PrismaRateLimitStore). Sin esto
// la tabla rate_limit_buckets crece sin control — una fila por cada llave
// (identidad+IP) distinta que alguna vez intentó autenticarse.
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function cleanExpiredRateLimitBuckets(): Promise<void> {
  const { count } = await prisma.rateLimitBucket.deleteMany({
    where: { resetTime: { lt: new Date() } },
  });

  console.log(`[cleanRateLimitBuckets.job] ${new Date().toISOString()} — buckets vencidos borrados: ${count}`);
}

export function startCleanRateLimitBucketsJob(): void {
  // Corre cada noche a las 00:30 (después de mora y liberación de apartados)
  cron.schedule('30 0 * * *', async () => {
    console.log('[cleanRateLimitBuckets.job] Iniciando limpieza de buckets vencidos...');
    await cleanExpiredRateLimitBuckets();
  });
  console.log('[cleanRateLimitBuckets.job] Cron registrado — corre cada noche a las 00:30');
}
