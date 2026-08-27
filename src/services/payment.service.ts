// src/services/payment.service.ts
import { PrismaClient, PaymentStatus, PaymentType, CuotaStatus, ContractStatus } from '@prisma/client';
import { RegistrarPagoDto, UpdatePaymentDto, PaymentFilters } from '../types/payment.types';
import { aplicarPagoACuotas } from './lib/pagoCuotas';
import { nextPaymentNumber } from './lib/paymentNumber';
import notificationService from './notification.service';
import { logger } from '../utils/logger';
import { round2 } from '../utils/money';
import { crearReciboLog } from './reciboLog.service';
import { buildReciboFolio } from '../utils/reciboFolio';

const prisma = new PrismaClient();

const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export class PaymentService {
  /**
   * Registra un pago de MENSUALIDAD de forma unificada:
   * Payment + cascada sobre cuotas + balance + mora, en UNA transacción.
   * Lo usan POST /payments y PATCH /cuotas/:id/pay.
   */
  async registrarPagoMensualidad(data: RegistrarPagoDto): Promise<{ payment: any; cuotasAfectadas: number[]; reciboId: string | null }> {
    if (!data.idempotencyKey?.trim()) {
      throw new Error('idempotencyKey es requerida — protege contra doble-submit (doble clic, retry de red)');
    }
    if (!data.amount || data.amount <= 0) throw new Error('El monto debe ser mayor a 0');

    // Idempotencia: si ya existe un pago con esta llave, es un replay (doble
    // clic, retry de red, doble pestaña) — devolvemos el pago ya creado, SIN
    // volver a correr la cascada. Chequeo primero de todo, antes de tocar
    // contrato/cuotas/folio, para no gastar nada en un duplicado obvio.
    const existingByKey = await prisma.payment.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
    if (existingByKey) {
      return {
        payment: await this.getPaymentById(existingByKey.id),
        cuotasAfectadas: [],
        reciboId: await this.buscarReciboIdPorPago(existingByKey.id),
      };
    }

    const contract = await prisma.contract.findUnique({
      where: { id: data.contractId },
      include: { client: true, project: true, lots: { include: { lot: true } } },
    });
    if (!contract) throw new Error('Contrato no encontrado');
    if (contract.status === ContractStatus.CANCELED) throw new Error('El contrato está cancelado');

    const cuotas = await prisma.cuota.findMany({
      where: { contractId: data.contractId },
      orderBy: { numeroCuota: 'asc' },
    });
    const hayPendientes = cuotas.some(c => c.status !== CuotaStatus.PAGADA);
    if (!hayPendientes) throw new Error('El contrato no tiene cuotas pendientes');

    const fechaPago = data.paymentDate instanceof Date ? data.paymentDate : new Date(data.paymentDate);

    const { updates, leftover } = aplicarPagoACuotas(
      data.amount,
      fechaPago,
      cuotas.map(c => ({
        id: c.id,
        montoEsperado: c.montoEsperado,
        montoPagado: c.montoPagado ?? 0,
        status: c.status === CuotaStatus.PAGADA ? 'PAGADA' as const : 'PENDIENTE' as const,
      })),
    );

    // Sobrepago extremo: el monto excede la suma de TODAS las cuotas
    // pendientes. Se rechaza ANTES de tocar la base de datos — nunca se
    // descarta el excedente en silencio (Tanda 1).
    if (leftover > 0.01) {
      const maxAceptable = round2(data.amount - leftover);
      throw new Error(
        `El pago ($${data.amount}) excede el saldo total pendiente del contrato. ` +
        `Máximo aceptable ahora mismo: $${maxAceptable}.`,
      );
    }
    const montoAplicado = round2(data.amount - leftover);

    const cuotasAfectadas = cuotas
      .filter(c => updates.some(u => u.id === c.id))
      .map(c => c.numeroCuota);

    const primera = cuotas.find(c => c.numeroCuota === cuotasAfectadas[0]);
    const concept = data.concept?.trim()
      || (cuotasAfectadas.length > 1
        ? `Mensualidades #${cuotasAfectadas[0]}–#${cuotasAfectadas[cuotasAfectadas.length - 1]}`
        : `Mensualidad #${cuotasAfectadas[0] ?? ''}${primera ? ` — ${primera.mes}` : ''}`);

    // Folio generado fuera de la tx: si la transacción hace rollback puede quedar un hueco de folio.
    const paymentNumber = await this.generatePaymentNumber(contract.projectId);

    let created;
    try {
      created = await prisma.$transaction(async (tx) => {
        // Releer balance dentro de la tx para evitar valor stale bajo concurrencia.
        const fresh = await tx.contract.findUnique({ where: { id: data.contractId }, select: { balance: true } });
        const newBalance = round2((fresh?.balance ?? 0) - montoAplicado);

        // El balance nunca debe quedar negativo en silencio: si esto pasa,
        // hay una inconsistencia previa de datos (cuotas vs. balance
        // desincronizados) — mejor reventar la transacción que persistir un
        // número que no cuadra.
        if (newBalance < -0.01) {
          throw new Error(
            `El balance resultante ($${newBalance}) quedaría negativo — inconsistencia de datos entre ` +
            `el balance del contrato y sus cuotas. Pago rechazado, no se modificó nada.`,
          );
        }

        const p = await tx.payment.create({
          data: {
            paymentNumber,
            idempotencyKey: data.idempotencyKey,
            contractId: data.contractId,
            clientId: contract.clientId,
            paymentType: PaymentType.INSTALLMENT,
            paymentMethod: data.paymentMethod,
            amount: data.amount,
            paymentDate: fechaPago,
            concept,
            referenceNumber: data.reference,
            notes: data.notes,
            status: PaymentStatus.CONFIRMED,
            balanceAfter: newBalance,
          },
        });
        for (const u of updates) {
          await tx.cuota.update({
            where: { id: u.id },
            data: { montoPagado: round2(u.montoPagado), fechaPago: u.fechaPago, status: u.status as CuotaStatus },
          });
        }
        await tx.contract.update({
          where: { id: data.contractId },
          data: { balance: newBalance },
        });
        const hoy = new Date();
        const vencidas = await tx.cuota.count({
          where: { contractId: data.contractId, status: CuotaStatus.PENDIENTE, fechaVencimiento: { lt: hoy } },
        });
        await tx.contract.update({
          where: { id: data.contractId },
          data: { moraMonthsCount: vencidas, status: vencidas > 0 ? ContractStatus.IN_MORA : ContractStatus.ACTIVE },
        });
        return p;
      });
    } catch (err: any) {
      // Carrera real: dos requests con la misma idempotencyKey llegaron casi
      // simultáneas, ambas pasaron el check de arriba, pero el @unique de
      // Postgres frenó a la segunda en el create(). No es un error real —
      // es un duplicado legítimo bajo concurrencia: devolvemos el pago que
      // sí se creó, igual que en el replay normal.
      if (err?.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION) {
        const winner = await prisma.payment.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
        if (winner) {
          return {
            payment: await this.getPaymentById(winner.id),
            cuotasAfectadas: [],
            reciboId: await this.buscarReciboIdPorPago(winner.id),
          };
        }
      }
      throw err;
    }

    // Notificaciones in-app (fire-and-forget): ADMIN (copia de todo) + el
    // cliente en su portal.
    try {
      const cliente = `${contract.client?.firstName ?? ''} ${contract.client?.lastName ?? ''}`.trim() || 'cliente';
      const montoFmt = data.amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      await notificationService.createNotification({
        type: 'PAYMENT',
        message: `Pago registrado: ${montoFmt} — ${cliente}`,
        relatedEntity: 'payment',
        relatedEntityId: created.id,
      });
      await notificationService.createNotification({
        type: 'PAYMENT',
        message: `Tu pago de ${montoFmt} fue registrado. ¡Gracias!`,
        relatedEntity: 'payment',
        relatedEntityId: created.id,
        audience: 'CLIENT',
        clientId: contract.clientId,
      });
    } catch (err) {
      logger.error(`Error creando notificación de pago ${created.id}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ReciboLog — DESPUÉS del commit del pago, nunca dentro de la misma
    // transacción: el pago es lo sagrado, el recibo es secundario. Un fallo
    // aquí (bug, BD caída) nunca debe tumbar un pago ya guardado —
    // crearReciboLog está diseñado para no lanzar nunca (ver
    // reciboLog.service.ts), devuelve null si algo sale mal.
    const lote = contract.lots?.[0]?.lot;
    const reciboId = await crearReciboLog({
      paymentId:      created.id,
      folio:          buildReciboFolio(contract.codigoLegado ?? contract.contractNumber, primera?.numeroCuota ?? 0, contract.installmentCount ?? 0),
      clienteNombre:  `${contract.client.firstName} ${contract.client.lastName}`,
      codigoLegado:   contract.codigoLegado,
      proyecto:       contract.project.name,
      loteLabel:      lote ? `M${lote.manzana} L-${lote.lotNumber}` : null,
      numeroCuota:    primera?.numeroCuota ?? 0,
      mes:            primera?.mes ?? '',
      plazoTotal:     contract.installmentCount ?? 0,
      montoPagado:    montoAplicado,
      fechaPago,
      concepto:       concept,
      balanceDespues: created.balanceAfter ?? 0,
    });

    const payment = await this.getPaymentById(created.id);
    return { payment, cuotasAfectadas, reciboId };
  }

  // Recibo ya emitido para este pago (replay de idempotencyKey) — lectura
  // simple, sin recrear nada. Si no existe (ej. crearReciboLog falló la
  // primera vez), devuelve null; el caller sigue sin QR, no sin pago.
  private async buscarReciboIdPorPago(paymentId: string): Promise<string | null> {
    const recibo = await prisma.reciboLog.findUnique({ where: { paymentId } });
    return recibo?.id ?? null;
  }

  // Listar pagos con filtros
  async getPayments(filters: PaymentFilters) {
    const where: any = {};

    if (filters.contractId) where.contractId = filters.contractId;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.status) where.status = filters.status;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;

    if (filters.minAmount || filters.maxAmount) {
      where.amount = {};
      if (filters.minAmount) where.amount.gte = filters.minAmount;
      if (filters.maxAmount) where.amount.lte = filters.maxAmount;
    }

    if (filters.startDate || filters.endDate) {
      where.paymentDate = {};
      if (filters.startDate) where.paymentDate.gte = filters.startDate;
      if (filters.endDate) where.paymentDate.lte = filters.endDate;
    }

    return await prisma.payment.findMany({
      where,
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            balance: true,
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  // Obtener un pago por ID
  async getPaymentById(id: string) {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            balance: true,
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new Error('Pago no encontrado');
    }

    return payment;
  }

  // Actualizar un pago
  // Tanda 1 (blindaje pre-producción): editar el monto o cancelar un pago ya
  // registrado NO revierte la cascada (cuotas/balance/mora quedan viejos,
  // sin recalcular) — eso es corrupción silenciosa de dinero real. Mejor
  // congelar ambos caminos con un error claro que permitir una edición que
  // descuadra. La reversión correcta con recálculo va a Tanda 2.
  async updatePayment(id: string, data: UpdatePaymentDto) {
    if (data.amount !== undefined) {
      throw new Error(
        'Editar el monto de un pago ya registrado no está soportado — corrompería cuotas y balance ' +
        'ya actualizados sin recalcularlos. Contacta soporte para un ajuste manual.',
      );
    }
    if (data.status === PaymentStatus.CANCELED) {
      throw new Error(
        'Cancelar un pago ya registrado no está soportado — dejaría cuotas y balance ' +
        'desactualizados sin revertir. Contacta soporte para un ajuste manual.',
      );
    }

    const payment = await prisma.payment.findUnique({ where: { id } });

    if (!payment) {
      throw new Error('Pago no encontrado');
    }

    // Mapear campos del DTO a campos del schema
    const updateData: any = {};
    if (data.paymentDate !== undefined) updateData.paymentDate = data.paymentDate;
    if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.installmentAmount !== undefined) updateData.installmentAmount = data.installmentAmount;
    if (data.extraAmount !== undefined) updateData.extraAmount = data.extraAmount;
    if (data.reference !== undefined) updateData.referenceNumber = data.reference;
    if (data.notes !== undefined) updateData.notes = data.notes;

    return await prisma.payment.update({
      where: { id },
      data: updateData,
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            balance: true,
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });
  }

  // Obtener pagos de un contrato
  async getPaymentsByContract(contractId: string) {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
    });

    if (!contract) {
      throw new Error('Contrato no encontrado');
    }

    return await prisma.payment.findMany({
      where: { contractId },
      orderBy: { paymentDate: 'desc' },
    });
  }

  // Generar número de pago único: continúa la serie del PROYECTO desde su
  // máximo real (no count()+1 global, que colisionaba tras borrados o
  // registros concurrentes — paymentNumber es unique global). Verifica
  // existencia por si la serie trae huecos o números legados fuera de patrón.
  private async generatePaymentNumber(projectId: string): Promise<string> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });

    if (!project) {
      throw new Error('Proyecto no encontrado');
    }

    const prefix = `${project.code}-PAY-`;
    const last = await prisma.payment.findFirst({
      where: { paymentNumber: { startsWith: prefix } },
      orderBy: { paymentNumber: 'desc' },
      select: { paymentNumber: true },
    });

    let candidate = nextPaymentNumber(last?.paymentNumber ?? null, prefix);
    while (await prisma.payment.findFirst({ where: { paymentNumber: candidate }, select: { id: true } })) {
      candidate = nextPaymentNumber(candidate, prefix);
    }

    return candidate;
  }
}

export default new PaymentService();