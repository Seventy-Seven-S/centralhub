/**
 * Traspasos: un lote cambia de manos.
 *
 * La decisión estructural: los pagos del contrato ORIGEN no se tocan nunca.
 * Si el cliente pagó $40,000, pagó $40,000 — es un hecho y sus recibos, que
 * tienen folio y validación pública, lo prueban. Restarle con un movimiento
 * negativo volvería mentira su historial.
 *
 * El dinero que se le respeta entra como UN pago nuevo en el destino, y la
 * diferencia queda explicada en el acta (montoAbonado − montoRespetado), con
 * quién la autorizó y por qué.
 */
import {
  PrismaClient, ContractStatus, PaymentType, PaymentMethod,
  PaymentStatus, LotStatus, CuotaStatus,
} from '@prisma/client';
import { deducirTipo, validarTraspaso } from './lib/traspaso';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();

export interface DatosContratoDestino {
  totalPrice: number;
  downPayment: number;
  installmentAmount: number;
  installmentCount: number;
  startDate: Date;
}

export interface CrearTraspasoInput {
  contratoOrigenId: string;
  clienteNuevoId: string;
  lotIdsDestino: string[];
  projectIdDestino: string;
  montoRespetado: number;
  fecha?: Date;
  motivo?: string;
  nota?: string;
  documentoUrl?: string;
  userId: string;
  /** Requerido en REUBICACION: el contrato destino se crea con estos datos. */
  datosContratoDestino?: DatosContratoDestino;
}

export const traspasoService = {
  async crear(input: CrearTraspasoInput) {
    const fecha = input.fecha ?? new Date();

    return prisma.$transaction(async (tx) => {
      // Se relee TODO dentro de la transacción: entre que la secretaria abrió
      // la pantalla y confirmó, el contrato pudo cambiar de estado.
      const origen = await tx.contract.findUnique({ where: { id: input.contratoOrigenId } });
      if (!origen) throw new Error('Contrato origen no encontrado');

      const lotesOrigen = (await tx.contractLot.findMany({
        where: { contractId: origen.id }, select: { lotId: true },
      })).map(l => l.lotId);

      const lotesDestino = await tx.lot.findMany({
        where: { id: { in: input.lotIdsDestino } },
        select: { id: true, status: true, projectId: true, currentPrice: true },
      });
      if (lotesDestino.length !== input.lotIdsDestino.length) {
        throw new Error('Alguno de los lotes destino no existe');
      }

      const tipo = deducirTipo(
        { projectId: origen.projectId, lotIds: lotesOrigen },
        { projectId: input.projectIdDestino, lotIds: input.lotIdsDestino },
      );
      const mismoLote = tipo === 'CAMBIO_TITULAR';

      // Lo abonado es la suma de sus pagos confirmados, no el campo balance:
      // el balance puede venir arrastrado, los pagos son hechos.
      const agg = await tx.payment.aggregate({
        where: { contractId: origen.id, status: PaymentStatus.CONFIRMED },
        _sum: { amount: true },
      });
      const montoAbonado = round2(agg._sum.amount ?? 0);
      const montoRespetado = round2(input.montoRespetado);

      const error = validarTraspaso({
        montoAbonado, montoRespetado, nota: input.nota,
        estadoOrigen: origen.status,
        estadoLoteDestino: lotesDestino.find(l => l.status !== LotStatus.AVAILABLE)?.status,
        mismoLote,
      });
      if (error) throw new Error(error);

      if (!mismoLote && !input.datosContratoDestino) {
        throw new Error('Falta la información del contrato destino');
      }

      const ultimo = await tx.traspaso.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } });
      const numero = (ultimo?.numero ?? 0) + 1;

      let contratoDestinoId: string | null = null;

      if (mismoLote) {
        // Cambia el dueño y ya: el contrato conserva pagos, cuotas e historia.
        await tx.contract.update({
          where: { id: origen.id },
          data: { clientId: input.clienteNuevoId },
        });
      } else {
        const d = input.datosContratoDestino!;
        const destino = await tx.contract.create({
          data: {
            contractNumber: `${origen.contractNumber}-T${numero}`,
            clientId: input.clienteNuevoId,
            projectId: input.projectIdDestino,
            contractDate: fecha,
            status: ContractStatus.ACTIVE,
            totalPrice: d.totalPrice,
            downPayment: d.downPayment,
            financingAmount: round2(d.totalPrice - d.downPayment),
            balance: round2(d.totalPrice - montoRespetado),
            installmentAmount: d.installmentAmount,
            installmentCount: d.installmentCount,
            startDate: d.startDate,
          },
        });
        contratoDestinoId = destino.id;

        // priceAtSale guarda a cuánto se vendió el lote EN ESTE contrato: el
        // precio del catálogo puede cambiar después y el contrato no.
        await tx.contractLot.createMany({
          data: lotesDestino.map(l => ({
            contractId: destino.id,
            lotId: l.id,
            priceAtSale: l.currentPrice,
          })),
        });
        await tx.lot.updateMany({
          where: { id: { in: input.lotIdsDestino } },
          data: { status: LotStatus.SOLD },
        });

        // El origen se cierra: no se deshizo la venta, cambió de manos.
        await tx.contractLot.deleteMany({ where: { contractId: origen.id } });
        await tx.cuota.deleteMany({ where: { contractId: origen.id, status: CuotaStatus.PENDIENTE } });
        await tx.lot.updateMany({
          where: { id: { in: lotesOrigen.filter(l => !input.lotIdsDestino.includes(l)) } },
          data: { status: LotStatus.AVAILABLE },
        });
        await tx.contract.update({
          where: { id: origen.id },
          data: { status: ContractStatus.TRASPASADO, balance: 0, moraMonthsCount: 0 },
        });
      }

      const traspaso = await tx.traspaso.create({
        data: {
          numero,
          fecha,
          tipo,
          contratoOrigenId: origen.id,
          contratoDestinoId,
          clienteAnteriorId: origen.clientId,
          clienteNuevoId: input.clienteNuevoId,
          montoAbonado,
          montoRespetado,
          motivo: input.motivo?.trim() || null,
          nota: input.nota?.trim() || null,
          documentoUrl: input.documentoUrl ?? null,
          createdById: input.userId,
        },
      });

      // El abono que viaja. Solo en reubicación: en cambio de titular el
      // contrato ya tiene ese dinero, no hay nada que mover.
      if (contratoDestinoId && montoRespetado > 0) {
        await tx.payment.create({
          data: {
            paymentNumber: `TR-${numero}-${Date.now()}`,
            contractId: contratoDestinoId,
            clientId: input.clienteNuevoId,
            paymentType: PaymentType.TRASPASO_ENTRADA,
            paymentMethod: PaymentMethod.TRANSFER,
            amount: montoRespetado,
            paymentDate: fecha,
            concept: `Abono por traspaso #${numero} desde ${origen.codigoLegado ?? origen.contractNumber}`,
            status: PaymentStatus.CONFIRMED,
            createdBy: input.userId,
            traspasoId: traspaso.id,
          },
        });
      }

      return traspaso;
    });
  },

  async listar() {
    return prisma.traspaso.findMany({
      include: {
        contratoOrigen:  { select: { codigoLegado: true, contractNumber: true, project: { select: { code: true } } } },
        contratoDestino: { select: { codigoLegado: true, contractNumber: true, project: { select: { code: true } } } },
        clienteAnterior: { select: { firstName: true, lastName: true } },
        clienteNuevo:    { select: { firstName: true, lastName: true } },
        createdBy:       { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ fecha: 'desc' }, { numero: 'desc' }],
    });
  },

  async obtener(id: string) {
    const t = await prisma.traspaso.findUnique({
      where: { id },
      include: {
        contratoOrigen:  { select: { codigoLegado: true, contractNumber: true, project: { select: { code: true, name: true } } } },
        contratoDestino: { select: { codigoLegado: true, contractNumber: true, project: { select: { code: true, name: true } } } },
        clienteAnterior: { select: { firstName: true, lastName: true } },
        clienteNuevo:    { select: { firstName: true, lastName: true } },
        createdBy:       { select: { firstName: true, lastName: true } },
        payments:        { select: { id: true, amount: true, paymentDate: true, concept: true } },
      },
    });
    if (!t) throw new Error('Traspaso no encontrado');
    return t;
  },
};

export default traspasoService;
