/**
 * Corte diario: la entrega del efectivo cobrado en el día al administrador.
 *
 * La "memoria" del corte es el vínculo pago→corteDiario, igual que en el corte
 * al dueño: un pago se propone mientras no tenga corte diario, y una vez
 * ligado no vuelve a aparecer. La línea de arranque la da createdBy — los
 * ~20,000 pagos migrados no lo tienen, así que nunca se le proponen a nadie
 * sin necesidad de un corte de arranque artificial.
 *
 * El estado "abierto" no existe como registro: "mi día" es una vista viva
 * sobre los pagos sin ligar. Solo se escribe cuando la persona cierra.
 */
import { PrismaClient, PaymentStatus, CorteDiarioStatus, UserRole } from '@prisma/client';
import { resumirDia, validarCierre, calcularRecepcion, PagoDelDia } from './lib/corteDiario';
import { round2 } from '../utils/money';
import { rangoDelDiaOperativo as rangoDelDia, fechaOperativa } from './lib/diaOperativo';
import { construirResumenDiario, CorteDelDia } from './lib/resumenDiarioCortes';

const prisma = new PrismaClient();

const PAGO_SELECT = {
  id: true, paymentNumber: true, amount: true, paymentMethod: true, paymentDate: true, concept: true,
  contract: {
    select: {
      id: true, codigoLegado: true, contractNumber: true,
      client: { select: { firstName: true, lastName: true } },
      project: { select: { code: true, name: true } },
    },
  },
} as const;

const aPagoDelDia = (p: any): PagoDelDia => ({
  amount: p.amount,
  paymentMethod: p.paymentMethod,
  proyectoCode: p.contract.project.code,
  proyectoNombre: p.contract.project.name,
});

// El día operativo lo define la zona del negocio, no la del servidor: Railway
// corre en UTC y a las 9 de la noche en Matamoros allá ya es el día siguiente.
// Ver services/lib/diaOperativo.ts.

export const corteDiarioService = {
  /** Los pagos que esta persona cobró y aún no entrega. Vista viva. */
  async miDia(userId: string, fecha = new Date()) {
    const { desde, hasta } = rangoDelDia(fecha);
    const pagos = await prisma.payment.findMany({
      where: {
        createdBy: userId,
        corteDiarioId: null,
        status: PaymentStatus.CONFIRMED,
        paymentDate: { gte: desde, lte: hasta },
      },
      select: PAGO_SELECT,
      orderBy: { paymentDate: 'asc' },
    });
    return { fecha: desde, pagos, resumen: resumirDia(pagos.map(aPagoDelDia)) };
  },

  /** Cierra el día: liga los pagos y deja el corte pendiente de entrega. */
  async cerrar(input: { userId: string; declarado: number; notaCobrador?: string; fecha?: Date }) {
    const fecha = input.fecha ?? new Date();
    const { desde, hasta } = rangoDelDia(fecha);

    return prisma.$transaction(async tx => {
      // Se releen dentro de la transacción: entre "mi día" y el cierre pudo
      // entrar otro cobro, y el corte debe incluirlo o no incluirlo, pero
      // nunca dejarlo a medias.
      const pagos = await tx.payment.findMany({
        where: {
          createdBy: input.userId,
          corteDiarioId: null,
          status: PaymentStatus.CONFIRMED,
          paymentDate: { gte: desde, lte: hasta },
        },
        select: { id: true, amount: true, paymentMethod: true, contract: { select: { project: { select: { code: true, name: true } } } } },
      });

      const resumen = resumirDia(pagos.map(aPagoDelDia));
      const error = validarCierre({ declarado: input.declarado, totalEfectivo: resumen.totalEfectivo, pagos: pagos.length });
      if (error) throw new Error(error);

      const ultimo = await tx.corteDiario.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } });

      const corte = await tx.corteDiario.create({
        data: {
          numero: (ultimo?.numero ?? 0) + 1,
          fecha: desde,
          cobradorId: input.userId,
          totalEfectivo: resumen.totalEfectivo,
          totalOtros: resumen.totalOtros,
          declarado: round2(input.declarado),
          notaCobrador: input.notaCobrador?.trim() || null,
        },
      });

      await tx.payment.updateMany({
        where: { id: { in: pagos.map(p => p.id) } },
        data: { corteDiarioId: corte.id },
      });

      return corte;
    });
  },

  /** El administrador cuenta el dinero y lo marca recibido. */
  async recibir(input: { corteId: string; adminId: string; recibido: number; notaAdmin?: string }) {
    const corte = await prisma.corteDiario.findUnique({ where: { id: input.corteId } });
    if (!corte) throw new Error('Corte no encontrado');
    if (corte.status === CorteDiarioStatus.RECIBIDO) throw new Error('Este corte ya fue recibido');
    // Nadie se recibe su propio dinero, aunque tenga rol de ADMIN.
    if (corte.cobradorId === input.adminId) throw new Error('No puedes recibir tu propio corte');

    const { diferencia, error } = calcularRecepcion({
      declarado: corte.declarado,
      recibido: input.recibido,
      notaAdmin: input.notaAdmin ?? '',
    });
    if (error) throw new Error(error);

    return prisma.corteDiario.update({
      where: { id: input.corteId },
      data: {
        status: CorteDiarioStatus.RECIBIDO,
        recibido: round2(input.recibido),
        diferencia,
        recibidoAt: new Date(),
        recibidoPorId: input.adminId,
        notaAdmin: input.notaAdmin?.trim() || null,
      },
    });
  },

  /**
   * Resumen del día: cuánto sumaron todos los cortes. Incluye cuántas personas
   * cobraron y aún no cierran — sin ese dato, un total parcial se lee como
   * final. Ver lib/resumenDiarioCortes.ts.
   */
  async resumenDiario(fecha?: Date) {
    const dia = fecha ?? new Date();
    const { desde, hasta, fecha: fechaStr } = rangoDelDia(dia);

    const [cortes, cobradores] = await Promise.all([
      prisma.corteDiario.findMany({
        where: { fecha: desde },
        include: {
          cobrador: { select: { firstName: true, lastName: true } },
          _count: { select: { payments: true } },
        },
        orderBy: { numero: 'asc' },
      }),
      // Quién registró cobros ese día, haya cerrado o no.
      prisma.payment.findMany({
        where: {
          status: PaymentStatus.CONFIRMED,
          createdBy: { not: null },
          paymentDate: { gte: desde, lte: hasta },
        },
        select: { createdBy: true },
        distinct: ['createdBy'],
      }),
    ]);

    const filas: CorteDelDia[] = cortes.map(c => ({
      numero: c.numero,
      cobradorId: c.cobradorId,
      cobrador: `${c.cobrador.firstName} ${c.cobrador.lastName}`,
      totalEfectivo: c.totalEfectivo,
      totalOtros: c.totalOtros,
      declarado: c.declarado,
      recibido: c.recibido,
      diferencia: c.diferencia,
      status: c.status as 'PENDIENTE_ENTREGA' | 'RECIBIDO',
      pagos: c._count.payments,
    }));

    return construirResumenDiario(
      fechaStr,
      filas,
      cobradores.map(p => p.createdBy!).filter(Boolean),
    );
  },

  /** ADMIN ve todos; cualquier otro rol ve solo los suyos. */
  async listar(usuario: { userId: string; role: string }, status?: CorteDiarioStatus) {
    return prisma.corteDiario.findMany({
      where: {
        ...(usuario.role === UserRole.ADMIN ? {} : { cobradorId: usuario.userId }),
        ...(status ? { status } : {}),
      },
      include: {
        cobrador: { select: { firstName: true, lastName: true } },
        recibidoPor: { select: { firstName: true, lastName: true } },
        _count: { select: { payments: true } },
      },
      orderBy: [{ fecha: 'desc' }, { numero: 'desc' }],
    });
  },

  async obtener(id: string, usuario: { userId: string; role: string }) {
    const corte = await prisma.corteDiario.findUnique({
      where: { id },
      include: {
        cobrador: { select: { firstName: true, lastName: true } },
        recibidoPor: { select: { firstName: true, lastName: true } },
        payments: { select: PAGO_SELECT, orderBy: { paymentDate: 'asc' } },
      },
    });
    if (!corte) throw new Error('Corte no encontrado');
    if (usuario.role !== UserRole.ADMIN && corte.cobradorId !== usuario.userId) {
      throw new Error('No tienes permiso para ver este corte');
    }
    return { ...corte, resumen: resumirDia(corte.payments.map(aPagoDelDia)) };
  },
};

export default corteDiarioService;
