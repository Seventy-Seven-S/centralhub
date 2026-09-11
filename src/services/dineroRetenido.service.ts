/**
 * Arma el bucket de dinero retenido desde la base. La lógica de cálculo vive
 * en lib/dineroRetenido.ts; aquí solo se junta la materia prima.
 */
import { PrismaClient, ContractStatus, PaymentType, PaymentStatus } from '@prisma/client';
import { construirResumenRetenido, CasoRetenido } from './lib/dineroRetenido';
import { PROYECTO_OCULTO } from './lib/proyectosOcultos';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();

export const dineroRetenidoService = {
  async resumen() {
    const contratos = await prisma.contract.findMany({
      where: {
        status: { in: [ContractStatus.CANCELED, ContractStatus.RESCISSION, ContractStatus.TRASPASADO] },
        // Los proyectos ocultos no entran en ningún total del negocio.
        project: { status: { not: PROYECTO_OCULTO } },
      },
      select: {
        id: true, codigoLegado: true, contractNumber: true, status: true, rescindedAt: true,
        project: { select: { code: true } },
        client: { select: { firstName: true, lastName: true } },
        payments: { where: { status: PaymentStatus.CONFIRMED }, select: { amount: true, paymentType: true } },
        traspasosOrigen: { select: { montoRespetado: true, fecha: true } },
      },
    });

    const casos: CasoRetenido[] = contratos.map(c => {
      // Las devoluciones se guardan como monto NEGATIVO (ver
      // contract.service.rescindContract), por eso el valor absoluto.
      const devuelto = round2(Math.abs(
        c.payments.filter(p => p.paymentType === PaymentType.RESCISSION_REFUND)
                  .reduce((s, p) => s + p.amount, 0),
      ));
      const pagado = round2(
        c.payments.filter(p => p.paymentType !== PaymentType.RESCISSION_REFUND)
                  .reduce((s, p) => s + p.amount, 0),
      );
      const respetado = round2(c.traspasosOrigen.reduce((s, t) => s + t.montoRespetado, 0));

      return {
        contratoId: c.id,
        codigo: c.codigoLegado ?? c.contractNumber,
        proyecto: c.project.code,
        cliente: `${c.client.firstName} ${c.client.lastName}`,
        origen: c.status === ContractStatus.TRASPASADO ? 'TRASPASO' : 'CANCELACION',
        pagado, devuelto, respetadoEnTraspaso: respetado,
        fecha: c.traspasosOrigen[0]?.fecha ?? c.rescindedAt ?? null,
      };
    });

    return construirResumenRetenido(casos);
  },
};

export default dineroRetenidoService;
