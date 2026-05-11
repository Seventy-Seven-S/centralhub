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

    // ── Ingresos por mes ─────────────────────────────────────────
    const rawPagosMes = await prisma.payment.findMany({
      where: {
        status: 'CONFIRMED',
        ...(projectId ? { contract: { projectId } } : {}),
      },
      select: { paymentDate: true, amount: true },
      orderBy: { paymentDate: 'asc' },
    });

    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const mesMap = new Map<string, number>();
    for (const p of rawPagosMes) {
      const d   = new Date(p.paymentDate);
      const key = `${MESES[d.getMonth()]} ${d.getFullYear()}`;
      mesMap.set(key, (mesMap.get(key) ?? 0) + (p.amount ?? 0));
    }
    const ingresosPorMes = Array.from(mesMap.entries())
      .map(([mes, total]) => ({ mes, total }))
      .slice(-12);

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
      ingresosPorMes,
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
