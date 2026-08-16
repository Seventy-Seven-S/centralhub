import { PrismaClient } from '@prisma/client';
import type { Store, IncrementResponse, Options } from 'express-rate-limit';

const prisma = new PrismaClient();

// Store persistente sobre Postgres (vía Prisma) para express-rate-limit.
// Sobrevive redeploys/reinicios, a diferencia del MemoryStore default —
// necesario porque Railway redeploya seguido durante el piloto.
export class PrismaRateLimitStore implements Store {
  private windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const now = new Date();
    const existing = await prisma.rateLimitBucket.findUnique({ where: { key } });

    if (existing && existing.resetTime > now) {
      const updated = await prisma.rateLimitBucket.update({
        where: { key },
        data: { points: { increment: 1 } },
      });
      return { totalHits: updated.points, resetTime: updated.resetTime };
    }

    const resetTime = new Date(now.getTime() + this.windowMs);
    const updated = await prisma.rateLimitBucket.upsert({
      where: { key },
      create: { key, points: 1, resetTime },
      update: { points: 1, resetTime },
    });
    return { totalHits: updated.points, resetTime: updated.resetTime };
  }

  async decrement(key: string): Promise<void> {
    await prisma.rateLimitBucket.updateMany({
      where: { key, points: { gt: 0 } },
      data: { points: { decrement: 1 } },
    });
  }

  async resetKey(key: string): Promise<void> {
    await prisma.rateLimitBucket.deleteMany({ where: { key } });
  }
}
