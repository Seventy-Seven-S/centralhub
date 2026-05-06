// src/services/cuota.service.ts
import { PrismaClient, CuotaStatus, ContractStatus } from '@prisma/client';

const prisma = new PrismaClient();

export interface PayCuotaDto {
  montoPagado: number;
  fechaPago?: Date;
}

export class CuotaService {

  async getCuotasByContract(contractId: string) {
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new Error('Contrato no encontrado');

    return prisma.cuota.findMany({
      where: { contractId },
      orderBy: { numeroCuota: 'asc' },
    });
  }

  async getCuotas(filters: { projectId?: string; status?: CuotaStatus }) {
    const where: any = {};

    if (filters.status) where.status = filters.status;

    if (filters.projectId) {
      where.contract = { projectId: filters.projectId };
    }

    return prisma.cuota.findMany({
      where,
      include: {
        contract: {
          select: {
            id: true,
            codigoLegado: true,
            client: { select: { id: true, firstName: true, lastName: true } },
            project: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: [{ contract: { codigoLegado: 'asc' } }, { numeroCuota: 'asc' }],
    });
  }

  async payCuota(id: string, data: PayCuotaDto) {
    const cuota = await prisma.cuota.findUnique({ where: { id } });
    if (!cuota) throw new Error('Cuota no encontrada');
    if (cuota.status === CuotaStatus.PAGADA) throw new Error('La cuota ya fue pagada');

    const fechaPago  = data.fechaPago instanceof Date
      ? data.fechaPago
      : data.fechaPago ? new Date(data.fechaPago) : new Date();
    const contractId = cuota.contractId;

    // Obtener todas las cuotas del contrato en orden
    const todasCuotas = await prisma.cuota.findMany({
      where:   { contractId },
      orderBy: { numeroCuota: 'asc' },
      select:  { id: true, montoEsperado: true, montoPagado: true, status: true, numeroCuota: true },
    });

    // Primera cuota no PAGADA (donde empieza el pool)
    const startIdx = todasCuotas.findIndex(c => c.status !== CuotaStatus.PAGADA);
    if (startIdx === -1) throw new Error('Todas las cuotas ya están pagadas');

    // Drenar pool a partir de la primera cuota pendiente
    let pool = data.montoPagado;
    const updates: Array<{ id: string; montoPagado: number; fechaPago: Date; status: CuotaStatus }> = [];

    for (let i = startIdx; i < todasCuotas.length && pool > 0; i++) {
      const c      = todasCuotas[i];
      const needed = c.montoEsperado - c.montoPagado;

      if (pool >= needed) {
        updates.push({ id: c.id, montoPagado: c.montoEsperado, fechaPago, status: CuotaStatus.PAGADA });
        pool -= needed;
      } else {
        updates.push({ id: c.id, montoPagado: c.montoPagado + pool, fechaPago, status: CuotaStatus.PENDIENTE });
        pool = 0;
      }
    }

    await prisma.$transaction([
      ...updates.map(u =>
        prisma.cuota.update({
          where: { id: u.id },
          data:  { montoPagado: u.montoPagado, fechaPago: u.fechaPago, status: u.status },
        })
      ),
      prisma.contract.update({
        where: { id: contractId },
        data:  { balance: { decrement: data.montoPagado } },
      }),
    ]);

    // Recalcular mora
    const hoy      = new Date();
    const vencidas = await prisma.cuota.count({
      where: { contractId, status: CuotaStatus.PENDIENTE, fechaVencimiento: { lt: hoy } },
    });
    await prisma.contract.update({
      where: { id: contractId },
      data:  {
        moraMonthsCount: vencidas,
        status: vencidas > 0 ? ContractStatus.IN_MORA : ContractStatus.ACTIVE,
      },
    });

    return prisma.cuota.findUnique({ where: { id } });
  }
}

export default new CuotaService();
