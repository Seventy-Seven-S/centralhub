// src/services/dashboard.service.ts
import { PrismaClient, CuotaStatus, LotStatus } from '@prisma/client';
import { construirDashboardOperativo } from './lib/dashboardOperativo';

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

    // ── Ingresos por mes + Gastos ────────────────────────────────
    const [rawPagosMes, gastosResult] = await Promise.all([
      prisma.payment.findMany({
        where: {
          status: 'CONFIRMED',
          ...(projectId ? { contract: { projectId } } : {}),
        },
        select: { paymentDate: true, amount: true },
        orderBy: { paymentDate: 'asc' },
      }),
      prisma.expense.aggregate({
        where: projectId ? { projectId } : {},
        _sum: { amount: true },
      }),
    ]);

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
      gastos: {
        total: Number(gastosResult._sum.amount ?? 0),
      },
    };
  }

  /**
   * Dashboard de MANAGER. Ver lib/dashboardOperativo.ts para el porqué de la
   * forma: sin totales del negocio, solo su propia operación del día.
   * `userId` acota los cobros a los que registró esa persona.
   */
  async getOperativo(userId: string | undefined, projectId?: string) {
    const contractWhere: any = projectId ? { projectId } : {};

    const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
    const finHoy    = new Date(); finHoy.setHours(23, 59, 59, 999);
    const enUnaSemana = new Date(); enUnaSemana.setDate(enUnaSemana.getDate() + 7);
    const ahora = new Date();

    const [cobros, vencidas, vencenEstaSemana, apartados, contratosActivos, lotesDisponibles] =
      await Promise.all([
        // Sin userId (no debería pasar tras el authenticate) no se atribuye
        // nada: mejor cero que mostrarle a alguien los cobros de otra persona.
        userId
          ? prisma.payment.aggregate({
              where: {
                createdBy: userId,
                status: 'CONFIRMED',
                paymentDate: { gte: inicioHoy, lte: finHoy },
                ...(projectId ? { contract: { projectId } } : {}),
              },
              _sum: { amount: true },
              _count: true,
            })
          : Promise.resolve({ _sum: { amount: 0 }, _count: 0 } as any),
        prisma.cuota.count({
          where: { status: CuotaStatus.PENDIENTE, fechaVencimiento: { lt: ahora },
                   ...(projectId ? { contract: { projectId } } : {}) },
        }),
        prisma.cuota.count({
          where: { status: CuotaStatus.PENDIENTE, fechaVencimiento: { gte: ahora, lte: enUnaSemana },
                   ...(projectId ? { contract: { projectId } } : {}) },
        }),
        prisma.lot.count({
          where: { status: LotStatus.RESERVED, reservationExpiry: { gte: ahora, lte: enUnaSemana },
                   ...(projectId ? { projectId } : {}) },
        }),
        prisma.contract.count({ where: { ...contractWhere, status: { in: ['ACTIVE', 'IN_MORA'] } } }),
        prisma.lot.count({ where: { status: LotStatus.AVAILABLE, ...(projectId ? { projectId } : {}) } }),
      ]);

    return construirDashboardOperativo({
      misCobrosHoy: { total: Number(cobros._sum.amount ?? 0), count: Number(cobros._count ?? 0) },
      cuotasVencidas: vencidas,
      cuotasVencenEstaSemana: vencenEstaSemana,
      apartadosPorVencer: apartados,
      contratosActivos,
      lotesDisponibles,
    });
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
