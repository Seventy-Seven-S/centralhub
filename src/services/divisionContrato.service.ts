// Separa un lote de un contrato con varios lotes, dejándolo en su propio
// contrato. Ver services/lib/divisionContrato para la regla de reparto.
//
// La operación entera va en UNA transacción: o quedan los dos contratos bien,
// o no cambia nada. Partir un contrato a medias dejaría dinero sin dueño.
import { randomUUID } from 'crypto';
import { PrismaClient, ContractStatus, CuotaStatus, PaymentStatus, Prisma } from '@prisma/client';
import { prisma as prismaGlobal } from '../config/database';
import contractService from './contract.service';
import { buildCuotaRows } from './lib/cuotaSchedule';
import { recomponerCuotas, estadoDelContrato, CuotaEnCalendario } from './lib/recomponerCuotas';
import { montosDeCuotas } from './lib/edicionContrato';
import {
  validarDivision, componerDivision, repartoSugerido, repartirPagos,
  ContratoADividir, Division,
} from './lib/divisionContrato';
import { round2 } from '../utils/money';

const prisma: PrismaClient = prismaGlobal as PrismaClient;

const TIPOS_QUE_CUBREN_CUOTAS: Prisma.EnumPaymentTypeFilter['in'] = ['INSTALLMENT', 'EXTRA_PAYMENT'];

async function leerContrato(contractId: string) {
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { lots: { include: { lot: { select: { manzana: true, lotNumber: true } } } } },
  });
  if (!c) throw new Error('Contrato no encontrado');

  const pagos = await prisma.payment.aggregate({
    where: { contractId, status: PaymentStatus.CONFIRMED },
    _sum: { amount: true },
  });

  const datos: ContratoADividir = {
    totalPrice: c.totalPrice,
    downPayment: c.downPayment,
    installmentCount: c.installmentCount,
    pagado: round2(pagos._sum.amount ?? 0),
    lotes: c.lots.map(l => ({ lotId: l.lotId, precio: l.priceAtSale })),
  };
  return { contrato: c, datos };
}

/** Lo que la pantalla necesita para proponer el reparto antes de decidir. */
export async function vistaPreviaDivision(contractId: string, lotId: string) {
  const { contrato, datos } = await leerContrato(contractId);
  const sugerido = repartoSugerido(datos, lotId);
  return {
    contractNumber: contrato.contractNumber,
    pagadoTotal: datos.pagado,
    totalPrice: datos.totalPrice,
    lotes: contrato.lots.map(l => ({
      lotId: l.lotId,
      etiqueta: `M${l.lot.manzana} L-${l.lot.lotNumber}`,
      precio: l.priceAtSale,
    })),
    sugerido,
    resultado: componerDivision(datos, { lotId, ...sugerido }),
  };
}

export interface EntradaDivision extends Division {
  motivo: string;
}

export async function dividirContrato(contractId: string, entrada: EntradaDivision, userId: string) {
  if (!entrada.motivo?.trim()) throw new Error('El motivo de la división es obligatorio');

  const { contrato, datos } = await leerContrato(contractId);

  if (contrato.status === ContractStatus.CANCELED || contrato.status === ContractStatus.RESCISSION) {
    throw new Error('Un contrato cancelado o rescindido no se divide');
  }

  const error = validarDivision(datos, entrada);
  if (error) throw new Error(error);

  const r = componerDivision(datos, entrada);
  const loteQueSeVa = contrato.lots.find(l => l.lotId === entrada.lotId)!;

  // Mensualidad y plazo: se conserva el plazo y la mensualidad se recalcula
  // sobre lo que cada lado va a financiar.
  const plazo = contrato.installmentCount ?? 60;
  const engancheNuevo = round2(Math.min(r.nuevo.pagado, contrato.downPayment * (r.nuevo.precio / datos.totalPrice)));
  const financiadoNuevo = round2(r.nuevo.precio - engancheNuevo);
  const engancheOriginal = round2(contrato.downPayment - engancheNuevo);
  const financiadoOriginal = round2(r.original.precio - engancheOriginal);

  const codigoNuevo = await contractService.generateContractNumber(contrato.projectId);

  const armarCalendario = (contratoId: string, financiado: number) => {
    const inicio = contrato.startDate ?? contrato.contractDate;
    return buildCuotaRows({
      contractId: contratoId,
      startDate: inicio,
      cuotaAmounts: montosDeCuotas(financiado, plazo),
    });
  };

  // Los pagos se REPARTEN entre los dos contratos. Sin esto, el contrato
  // nuevo nace con saldo pero sin un solo pago que lo respalde, y el original
  // se queda con todo el dinero contra un precio ya reducido: en ambos se
  // rompe el invariante de que el saldo es el precio menos lo pagado.
  const pagosDelContrato = await prisma.payment.findMany({
    where: { contractId, status: PaymentStatus.CONFIRMED },
    orderBy: { paymentDate: 'asc' },
    select: { id: true, amount: true, concept: true, paymentDate: true, paymentType: true,
              paymentMethod: true, clientId: true, paymentNumber: true },
  });
  const reparto = repartirPagos(pagosDelContrato, r.nuevo.pagado);

  const nuevoId = randomUUID();
  const filasNuevo = armarCalendario(nuevoId, financiadoNuevo);
  const filasOriginal = armarCalendario(contractId, financiadoOriginal);

  // Los pagos NO se copian: el dinero que se le acredita a cada lado se aplica
  // sobre su propio calendario, y la suma reproduce lo que había.
  const aplicar = (filas: ReturnType<typeof buildCuotaRows>, monto: number) => {
    const vacias: CuotaEnCalendario[] = filas.map(f => ({
      id: f.id, numeroCuota: f.numeroCuota, montoEsperado: f.montoEsperado,
      montoPagado: 0, status: 'PENDIENTE', fechaPago: null,
    }));
    return recomponerCuotas(monto > 0 ? [{ amount: monto, paymentDate: contrato.startDate ?? contrato.contractDate }] : [], vacias);
  };

  const recNuevo = aplicar(filasNuevo, round2(r.nuevo.pagado - engancheNuevo));
  const recOriginal = aplicar(filasOriginal, round2(r.original.pagado - engancheOriginal));

  const estNuevo = estadoDelContrato(r.nuevo.balance, recNuevo.cuotas.map(c => ({
    status: c.status, fechaVencimiento: filasNuevo.find(f => f.id === c.id)!.fechaVencimiento })));
  const estOriginal = estadoDelContrato(r.original.balance, recOriginal.cuotas.map(c => ({
    status: c.status, fechaVencimiento: filasOriginal.find(f => f.id === c.id)!.fechaVencimiento })));

  await prisma.$transaction(async (tx) => {
    await tx.contract.create({
      data: {
        id: nuevoId,
        contractNumber: `${contrato.contractNumber}-D${Date.now().toString().slice(-5)}`,
        codigoLegado: codigoNuevo,
        clientId: contrato.clientId,
        projectId: contrato.projectId,
        agentId: contrato.agentId,
        contractDate: contrato.contractDate,
        startDate: contrato.startDate,
        status: ContractStatus[estNuevo.status],
        totalPrice: r.nuevo.precio,
        downPayment: engancheNuevo,
        financingAmount: financiadoNuevo,
        balance: r.nuevo.balance,
        installmentCount: plazo,
        installmentAmount: filasNuevo[0]?.montoEsperado ?? null,
        moraMonthsCount: estNuevo.moraMonthsCount,
        notes: `Separado de ${contrato.codigoLegado ?? contrato.contractNumber}: ${entrada.motivo.trim()}`,
      },
    });

    // El vínculo se MUEVE al contrato nuevo y se le ajusta el precio de venta.
    // No hay clave única (contrato, lote), así que va por updateMany.
    await tx.contractLot.updateMany({
      where: { contractId, lotId: entrada.lotId },
      data: { contractId: nuevoId, priceAtSale: r.nuevo.precio },
    });

    await tx.cuota.createMany({
      data: filasNuevo.map(f => {
        const c = recNuevo.cuotas.find(x => x.id === f.id)!;
        return {
          id: f.id, contractId: nuevoId, numeroCuota: f.numeroCuota, mes: f.mes,
          montoEsperado: f.montoEsperado, montoPagado: c.montoPagado,
          fechaVencimiento: f.fechaVencimiento, fechaPago: c.fechaPago,
          status: c.status === 'PAGADA' ? CuotaStatus.PAGADA : CuotaStatus.PENDIENTE,
        };
      }),
    });

    // Cada pago conjunto se parte: la porción que se va nace como pago del
    // contrato nuevo, y al original se le deja su parte. La suma de los dos
    // reproduce el monto original, así que los ingresos del proyecto no cambian.
    for (const pago of pagosDelContrato) {
      const corte = reparto.find(x => x.id === pago.id)!;
      if (corte.alNuevo <= 0) continue;

      if (corte.alOriginal <= 0) {
        // Se va completo: basta moverlo, sin inventar filas nuevas.
        await tx.payment.update({ where: { id: pago.id }, data: { contractId: nuevoId } });
        continue;
      }

      await tx.payment.update({ where: { id: pago.id }, data: { amount: corte.alOriginal } });
      await tx.payment.create({
        data: {
          paymentNumber: `${pago.paymentNumber}-D`,
          contractId: nuevoId,
          clientId: pago.clientId,
          paymentType: pago.paymentType,
          paymentMethod: pago.paymentMethod,
          amount: corte.alNuevo,
          paymentDate: pago.paymentDate,
          concept: pago.concept,
          status: PaymentStatus.CONFIRMED,
        },
      });
    }

    await tx.cuota.deleteMany({ where: { contractId } });
    await tx.cuota.createMany({
      data: filasOriginal.map(f => {
        const c = recOriginal.cuotas.find(x => x.id === f.id)!;
        return {
          id: f.id, contractId, numeroCuota: f.numeroCuota, mes: f.mes,
          montoEsperado: f.montoEsperado, montoPagado: c.montoPagado,
          fechaVencimiento: f.fechaVencimiento, fechaPago: c.fechaPago,
          status: c.status === 'PAGADA' ? CuotaStatus.PAGADA : CuotaStatus.PENDIENTE,
        };
      }),
    });

    await tx.contract.update({
      where: { id: contractId },
      data: {
        totalPrice: r.original.precio,
        downPayment: engancheOriginal,
        financingAmount: financiadoOriginal,
        balance: r.original.balance,
        installmentAmount: filasOriginal[0]?.montoEsperado ?? null,
        status: ContractStatus[estOriginal.status],
        moraMonthsCount: estOriginal.moraMonthsCount,
      },
    });

    // Bitácora en ambos lados: la división mueve dinero y tiene que quedar rastro.
    await tx.cambioContrato.createMany({
      data: [
        { contractId, userId, campo: 'totalPrice', valorAnterior: String(datos.totalPrice), valorNuevo: String(r.original.precio), motivo: `División: se separó ${loteQueSeVa ? 'un lote' : ''} a ${codigoNuevo}. ${entrada.motivo.trim()}` },
        { contractId, userId, campo: 'balance', valorAnterior: String(contrato.balance ?? ''), valorNuevo: String(r.original.balance), motivo: entrada.motivo.trim() },
        { contractId: nuevoId, userId, campo: 'origen', valorAnterior: contrato.codigoLegado ?? contrato.contractNumber, valorNuevo: codigoNuevo, motivo: `Contrato creado al separar un lote de ${contrato.codigoLegado ?? contrato.contractNumber}. ${entrada.motivo.trim()}` },
      ],
    });
  });

  return { nuevoContratoId: nuevoId, codigoNuevo, resultado: r };
}
