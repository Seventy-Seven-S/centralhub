// src/services/dashboard.service.ts
import { PrismaClient, CuotaStatus, LotStatus } from '@prisma/client';

const prisma = new PrismaClient();

export class DashboardService {

  async getSummary(projectId?: string) {
    const contractWhere: any = projectId ? { projectId } : {};
    const lotWhere: any      = projectId ? { projectId } : {};

    // ── Contratos ────────────────────────────────────────────────
    const [totalContratos, contratosEnMora] = await Promise.all([
      prisma.contract.count({ where: contractWhere }),
      prisma.contract.count({ where: { ...contractWhere, moraMonthsCount: { gt: 0 } } }),
    ]);

    // ── Ingresos (pagos confirmados) ─────────────────────────────
    const pagos = await prisma.payment.aggregate({
      where: {
        status: 'CONFIRMED',
        ...(projectId ? { contract: { projectId } } : {}),
      },
      _sum: { amount: true },
      _count: true,
    });
    const ingresosTotal = pagos._sum.amount ?? 0;
    const totalPagos    = pagos._count;

    // ── Cuotas vencidas sin pagar ────────────────────────────────
    const hoy = new Date();
    const cuotasVencidas = await prisma.cuota.count({
      where: {
        status: CuotaStatus.PENDIENTE,
        fechaVencimiento: { lt: hoy },
        ...(projectId ? { contract: { projectId } } : {}),
      },
    });

    // ── Lotes ────────────────────────────────────────────────────
    const [lotesDisponibles, lotesReservados, lotesVendidos] = await Promise.all([
      prisma.lot.count({ where: { ...lotWhere, status: LotStatus.AVAILABLE } }),
      prisma.lot.count({ where: { ...lotWhere, status: LotStatus.RESERVED } }),
      prisma.lot.count({ where: { ...lotWhere, status: LotStatus.SOLD } }),
    ]);
    const totalLotes = lotesDisponibles + lotesReservados + lotesVendidos;

    // ── Distribución por plazo ───────────────────────────────────
    const rawPlazo = await prisma.contract.groupBy({
      by: ['installmentCount'],
      where: contractWhere,
      _count: { id: true },
      orderBy: { installmentCount: 'asc' },
    });
    const distribucionPlazo = rawPlazo.map(r => ({
      plazoMeses: r.installmentCount ?? 0,
      contratos: r._count.id,
    }));

    // ── Cuotas por status ────────────────────────────────────────
    const rawCuotas = await prisma.cuota.groupBy({
      by: ['status'],
      where: projectId ? { contract: { projectId } } : {},
      _count: { id: true },
    });
    const cuotasPorStatus = Object.fromEntries(
      rawCuotas.map(r => [r.status, r._count.id])
    );

    return {
      contratos: {
        total: totalContratos,
        enMora: contratosEnMora,
      },
      ingresos: {
        total: ingresosTotal,
        totalPagos,
      },
      cuotas: {
        vencidasSinPagar: cuotasVencidas,
        porStatus: cuotasPorStatus,
      },
      lotes: {
        total: totalLotes,
        disponibles: lotesDisponibles,
        reservados: lotesReservados,
        vendidos: lotesVendidos,
        porcentajeVendido: totalLotes > 0
          ? Math.round((lotesVendidos / totalLotes) * 100)
          : 0,
      },
      distribucionPlazo,
    };
  }

  async getMoraDetail(projectId?: string) {
    const hoy = new Date();
    return prisma.cuota.findMany({
      where: {
        status: CuotaStatus.PENDIENTE,
        fechaVencimiento: { lt: hoy },
        ...(projectId ? { contract: { projectId } } : {}),
      },
      include: {
        contract: {
          select: {
            id: true,
            codigoLegado: true,
            client: { select: { id: true, firstName: true, lastName: true, phone: true } },
            project: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { fechaVencimiento: 'asc' },
    });
  }
}

export default new DashboardService();
