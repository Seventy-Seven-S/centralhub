// src/services/cuota.service.ts
import { PrismaClient, CuotaStatus, PaymentMethod } from '@prisma/client';
import paymentService from './payment.service';

const prisma = new PrismaClient();

export interface PayCuotaDto {
  montoPagado: number;
  fechaPago?: Date;
  // Reenviada tal cual a registrarPagoMensualidad — misma protección de
  // idempotencia que POST /payments, sin duplicar la lógica.
  idempotencyKey?: string;
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

    // Delegar en el servicio unificado: crea el Payment (antes este flujo no lo
    // creaba y los pagos por-cuota no aparecían en el historial), aplica la
    // cascada, baja balance y recalcula mora. La notificación vive allá.
    const { reciboId } = await paymentService.registrarPagoMensualidad({
      contractId: cuota.contractId,
      amount: data.montoPagado,
      paymentDate: data.fechaPago ?? new Date(),
      // PagarCuotaModal no tiene selector de método — hoy todos los pagos por
      // esta vía son en efectivo. Si en el futuro empiezan a recibir
      // transferencias, agregar un selector en el modal en vez de asumir.
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: data.idempotencyKey as string,
    });

    const cuotaActualizada = await prisma.cuota.findUnique({ where: { id } });
    return { ...cuotaActualizada, reciboId };
  }
}

export default new CuotaService();
