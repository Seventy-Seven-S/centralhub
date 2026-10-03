// Edición de los datos de dinero de un contrato, reservada a ADMIN.
//
// El servicio de pagos prohíbe a propósito editar o cancelar un pago ya
// registrado, porque dejaría cuotas y balance sin recalcular. Este servicio es
// la contraparte legítima: cambia el dato Y rehace todo lo que depende de él,
// en una sola transacción, dejando rastro de quién y por qué.
import { PrismaClient, CuotaStatus, ContractStatus, Prisma } from '@prisma/client';
import { prisma as prismaGlobal } from '../config/database';
import { buildCuotaRows } from './lib/cuotaSchedule';
import { recomponerCuotas, estadoDelContrato, CuotaEnCalendario } from './lib/recomponerCuotas';
import {
  validarEdicion, camposQueCambian, montosDeCuotas, inicioDesdeMes, mensualidadPara,
  DatosActuales, Edicion,
} from './lib/edicionContrato';
import { round2 } from '../utils/money';

const prisma: PrismaClient = prismaGlobal as PrismaClient;

export interface EntradaEdicion extends Edicion {
  motivo: string;
}

export interface ResultadoEdicion {
  contractNumber: string;
  cambios: Array<{ campo: string; valorAnterior: string | null; valorNuevo: string | null }>;
  balanceAntes: number | null;
  balanceDespues: number;
  moraAntes: number;
  moraDespues: number;
  cuotasGeneradas: number;
}

const TIPOS_QUE_CUBREN_CUOTAS: Prisma.EnumPaymentTypeFilter['in'] = ['INSTALLMENT', 'EXTRA_PAYMENT'];

/**
 * Aplica la edición. `dryRun` calcula y devuelve el resultado sin escribir —
 * lo usa el script de corrección masiva de calendarios desfasados.
 */
export async function editarDatosDelContrato(
  contractId: string,
  entrada: EntradaEdicion,
  userId: string,
  opciones: { dryRun?: boolean; forzarRecalculo?: boolean } = {},
): Promise<ResultadoEdicion> {
  if (!entrada.motivo?.trim()) throw new Error('El motivo del cambio es obligatorio');

  const contrato = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { lots: { select: { lotId: true } } },
  });
  if (!contrato) throw new Error('Contrato no encontrado');
  if (contrato.status === ContractStatus.CANCELED || contrato.status === ContractStatus.RESCISSION) {
    throw new Error('Un contrato cancelado o rescindido no se edita — sus cifras son históricas');
  }

  const actual: DatosActuales = {
    totalPrice: contrato.totalPrice,
    downPayment: contrato.downPayment,
    installmentAmount: contrato.installmentAmount,
    installmentCount: contrato.installmentCount,
    startDate: contrato.startDate,
    lotIds: contrato.lots.map(l => l.lotId),
  };

  // ── Contexto para validar ──────────────────────────────────────────────────
  const [sumaPagos, primerPago, ocupados] = await Promise.all([
    prisma.payment.aggregate({ where: { contractId, status: 'CONFIRMED' }, _sum: { amount: true } }),
    prisma.payment.findFirst({
      where: { contractId, status: 'CONFIRMED', paymentType: { in: TIPOS_QUE_CUBREN_CUOTAS } },
      orderBy: { paymentDate: 'asc' }, select: { paymentDate: true },
    }),
    entrada.lotIds
      ? prisma.contractLot.findMany({
          where: {
            lotId: { in: entrada.lotIds },
            contractId: { not: contractId },
            contract: { status: { in: [ContractStatus.SIGNED, ContractStatus.ACTIVE, ContractStatus.IN_MORA, ContractStatus.COMPLETED] } },
          },
          select: { lotId: true },
        })
      : Promise.resolve([] as Array<{ lotId: string }>),
  ]);
  const pagado = round2(sumaPagos._sum.amount ?? 0);

  const error = validarEdicion(actual, entrada, {
    pagado,
    primerPago: primerPago?.paymentDate ?? null,
    lotesOcupadosPorOtros: ocupados.map(o => o.lotId),
  });
  if (error) throw new Error(error);

  const cambios = camposQueCambian(actual, entrada);
  // `forzarRecalculo` sirve para el caso en que los datos del contrato están
  // bien pero su CALENDARIO no concuerda con ellos: H119 tenía mensualidad de
  // $4,375 y las primeras cuatro cuotas en $4,500, así que su sobrepago se lo
  // comía el propio calendario. Ahí no cambia ningún campo — se rearma.
  if (cambios.length === 0 && !opciones.forzarRecalculo) {
    throw new Error('No hay ningún cambio que aplicar');
  }

  // ── Armar el calendario nuevo ──────────────────────────────────────────────
  const totalPrice = entrada.totalPrice ?? actual.totalPrice;
  const plazo = entrada.installmentCount ?? actual.installmentCount ?? 0;
  // El enganche puede venir corregido en la misma edición: usar el viejo hacía
  // que las cuotas se armaran contra un financiado equivocado.
  const enganche = entrada.downPayment ?? actual.downPayment;
  const financiado = round2(totalPrice - enganche);
  // La mensualidad sale de lo financiado entre el plazo. Si cambia cualquiera
  // de los dos y no se captura una mensualidad, hay que recalcularla:
  // conservar la vieja hace que las cuotas no cierren y la corrección se
  // rechaza sola. Pasó con V223, cuyo enganche de $15,000 estaba capturado
  // como mensualidad y dejaba el contrato con enganche en cero.
  const cambiaPlazo = entrada.installmentCount !== undefined
    && entrada.installmentCount !== actual.installmentCount;
  const cambiaEnganche = entrada.downPayment !== undefined
    && entrada.downPayment !== actual.downPayment;
  const mensualidad = (cambiaPlazo || cambiaEnganche)
    ? mensualidadPara(financiado, plazo, entrada.installmentAmount) ?? undefined
    : entrada.installmentAmount ?? actual.installmentAmount ?? undefined;
  const inicio = entrada.mesInicioCalendario ? inicioDesdeMes(entrada.mesInicioCalendario) : actual.startDate;

  if (plazo <= 0 || !inicio) {
    throw new Error('El contrato necesita plazo y mes de inicio para rearmar su calendario');
  }

  const filas = buildCuotaRows({
    contractId,
    startDate: inicio,
    cuotaAmounts: montosDeCuotas(financiado, plazo, mensualidad),
  });

  // ── Reaplicar los pagos reales encima del calendario nuevo ─────────────────
  const pagos = await prisma.payment.findMany({
    where: { contractId, status: 'CONFIRMED', paymentType: { in: TIPOS_QUE_CUBREN_CUOTAS } },
    orderBy: { paymentDate: 'asc' },
    select: { amount: true, paymentDate: true },
  });

  const vacias: CuotaEnCalendario[] = filas.map(f => ({
    id: f.id, numeroCuota: f.numeroCuota, montoEsperado: f.montoEsperado,
    montoPagado: 0, status: 'PENDIENTE', fechaPago: null,
  }));
  const r = recomponerCuotas(pagos, vacias);

  const balanceDespues = round2(financiado - r.totalPagado);
  const est = estadoDelContrato(
    balanceDespues,
    r.cuotas.map(c => ({
      status: c.status,
      fechaVencimiento: filas.find(f => f.id === c.id)!.fechaVencimiento,
    })),
  );

  const resultado: ResultadoEdicion = {
    contractNumber: contrato.contractNumber,
    cambios,
    balanceAntes: contrato.balance,
    balanceDespues,
    moraAntes: contrato.moraMonthsCount,
    moraDespues: est.moraMonthsCount,
    cuotasGeneradas: filas.length,
  };
  if (opciones.dryRun) return resultado;

  // ── Escribir ───────────────────────────────────────────────────────────────
  // El balance y la mora se anotan también en la bitácora aunque el ADMIN no
  // los toque: son el efecto visible del cambio y es lo que el equipo verá.
  const bitacora = [
    ...cambios,
    { campo: 'balance', valorAnterior: String(contrato.balance ?? ''), valorNuevo: String(balanceDespues) },
    { campo: 'moraMonthsCount', valorAnterior: String(contrato.moraMonthsCount), valorNuevo: String(est.moraMonthsCount) },
  ];

  await prisma.$transaction(async (tx) => {
    await tx.cuota.deleteMany({ where: { contractId } });
    await tx.cuota.createMany({
      data: filas.map(f => {
        const c = r.cuotas.find(x => x.id === f.id)!;
        return {
          id: f.id, contractId, numeroCuota: f.numeroCuota, mes: f.mes,
          montoEsperado: f.montoEsperado, montoPagado: c.montoPagado,
          fechaVencimiento: f.fechaVencimiento, fechaPago: c.fechaPago,
          status: c.status === 'PAGADA' ? CuotaStatus.PAGADA : CuotaStatus.PENDIENTE,
        };
      }),
    });

    if (entrada.lotIds) {
      await tx.contractLot.deleteMany({ where: { contractId } });
      await tx.contractLot.createMany({
        data: entrada.lotIds.map(lotId => ({ contractId, lotId, priceAtSale: totalPrice })),
      });
      await tx.lot.updateMany({ where: { id: { in: entrada.lotIds } }, data: { status: 'SOLD' } });
      // Los lotes que el contrato soltó vuelven a estar libres.
      const soltados = actual.lotIds.filter(id => !entrada.lotIds!.includes(id));
      if (soltados.length) await tx.lot.updateMany({ where: { id: { in: soltados } }, data: { status: 'AVAILABLE' } });
    }

    await tx.contract.update({
      where: { id: contractId },
      data: {
        totalPrice,
        downPayment: enganche,
        financingAmount: financiado,
        installmentCount: plazo,
        installmentAmount: mensualidad ?? null,
        startDate: inicio,
        balance: balanceDespues,
        status: ContractStatus[est.status],
        moraMonthsCount: est.moraMonthsCount,
      },
    });

    await tx.cambioContrato.createMany({
      data: bitacora.map(b => ({ ...b, contractId, userId, motivo: entrada.motivo.trim() })),
    });
  });

  return resultado;
}

export async function historialDeCambios(contractId: string) {
  return prisma.cambioContrato.findMany({
    where: { contractId },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
  });
}
