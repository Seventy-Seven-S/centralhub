import { prisma } from '../config/database';
import { EstadoCuentaLog } from '@prisma/client';

export function generarFolio(contractId: string): string {
  const now    = new Date();
  const year   = now.getFullYear();
  const month  = String(now.getMonth() + 1).padStart(2, '0');
  const day    = String(now.getDate()).padStart(2, '0');
  const prefix = contractId.slice(0, 6).toUpperCase();
  const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const random = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `EC-${year}${month}${day}-${prefix}-${random}`;
}

export async function registrarGeneracion(data: {
  folio:       string;
  contractId:  string;
  clientId:    string;
  contentHash: string;
  ip?:         string;
}): Promise<EstadoCuentaLog> {
  return prisma.estadoCuentaLog.create({
    data: {
      folio:          data.folio,
      contractId:     data.contractId,
      clientId:       data.clientId,
      contentHash:    data.contentHash,
      generatedByIp:  data.ip ?? null,
    },
  });
}

export async function verificarFolio(folio: string): Promise<EstadoCuentaLog | null> {
  return prisma.estadoCuentaLog.findUnique({
    where: { folio },
    include: {
      contract: {
        include: {
          client:  true,
          project: true,
        },
      },
    },
  });
}
