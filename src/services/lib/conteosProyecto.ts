// Conteos de la tarjeta de Proyectos. Viven aparte porque antes se calculaban
// sueltos en el controlador y arrastraban dos errores: se contaban contratos
// ya cancelados, y los lotes reservados o no disponibles no entraban en
// ninguna cifra, así que desaparecían de la pantalla y de la barra de avance.
import { ContractStatus, LotStatus } from '@prisma/client';

/**
 * Un contrato "vivo" es el que representa una venta en pie. Se excluyen:
 * DRAFT (aún no es venta), CANCELED y RESCISSION (se deshizo) y TRASPASADO
 * (el lote cambió de manos y el contrato destino ya lo cuenta — sumarlo
 * contaría la misma venta dos veces).
 */
export const CONTRATOS_VIVOS: ContractStatus[] = [
  ContractStatus.SIGNED,
  ContractStatus.ACTIVE,
  ContractStatus.IN_MORA,
  ContractStatus.COMPLETED,
];

export interface ResumenLotes {
  total: number;
  vendidos: number;
  disponibles: number;
  reservados: number;
  noDisponibles: number;
}

/** Recibe el groupBy de Prisma por estado y lo deja en cifras para la tarjeta.
 *  El total sale de sumar los cuatro estados, nunca de un campo capturado. */
export function resumirLotes(filas: Array<{ status: LotStatus; _count: number }>): ResumenLotes {
  const de = (s: LotStatus) => filas.find(f => f.status === s)?._count ?? 0;
  const vendidos = de(LotStatus.SOLD);
  const disponibles = de(LotStatus.AVAILABLE);
  const reservados = de(LotStatus.RESERVED);
  const noDisponibles = de(LotStatus.UNAVAILABLE);
  return {
    total: vendidos + disponibles + reservados + noDisponibles,
    vendidos, disponibles, reservados, noDisponibles,
  };
}
