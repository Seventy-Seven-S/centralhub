// Cortes: entrega periódica de ingresos al dueño del terreno.
// La "memoria" del corte es el vínculo pago→corte: un pago confirmado se
// propone mientras no tenga corte, y una vez ligado no vuelve a aparecer.
import { PrismaClient, PaymentStatus } from '@prisma/client';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();

export interface RepartoItem { categoryId: string; amount: number }

export interface CrearCorteInput {
  projectId: string;
  fecha: Date | string;
  paymentIds: string[];
  reparto: RepartoItem[];      // egresos capturados (Central, Oficina 2, Planos, Notaría…)
  dueno: string;               // nombre del dueño que firma de recibido
  duenoCategoryId: string;     // categoría "Dueño del terreno" donde se registra lo entregado
  userId: string;
  notas?: string;
}

/** El dueño recibe el remanente. Puro, sin Prisma. */
export function calcularReparto(totalIngresos: number, reparto: RepartoItem[]) {
  if (reparto.some(r => !Number.isFinite(r.amount) || r.amount < 0)) throw new Error('Los egresos no pueden ser negativos');
  const totalEgresos = round2(reparto.reduce((a, r) => a + r.amount, 0));
  if (totalEgresos > totalIngresos + 0.01) throw new Error('Los egresos exceden el total de ingresos del corte');
  return { totalEgresos, entregadoDueno: round2(totalIngresos - totalEgresos) };
}

const PAGO_SELECT = {
  id: true, paymentNumber: true, paymentType: true, paymentMethod: true, amount: true, paymentDate: true, concept: true,
  contract: { select: { id: true, projectId: true, codigoLegado: true, contractNumber: true, client: { select: { firstName: true, lastName: true } } } },
} as const;

export const corteService = {
  /** Pagos confirmados del proyecto que aún no se han reportado en ningún corte. */
  async pendientes(projectId: string) {
    const pagos = await prisma.payment.findMany({
      where: { status: PaymentStatus.CONFIRMED, corteId: null, contract: { projectId } },
      select: PAGO_SELECT,
      orderBy: { paymentDate: 'asc' },
    });
    return { pagos, total: round2(pagos.reduce((a, p) => a + p.amount, 0)) };
  },

  async listar(projectId?: string) {
    return prisma.corte.findMany({
      where: projectId ? { projectId } : {},
      include: { project: { select: { code: true, name: true } }, _count: { select: { payments: true } } },
      orderBy: [{ fecha: 'desc' }, { numero: 'desc' }],
    });
  },

  async obtener(id: string) {
    const corte = await prisma.corte.findUnique({
      where: { id },
      include: {
        project: { select: { code: true, name: true } },
        payments: { select: PAGO_SELECT, orderBy: { paymentDate: 'asc' } },
        expenses: { include: { category: { select: { name: true } } } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!corte) throw new Error('Corte no encontrado');
    return corte;
  },

  /** Todo o nada: corte + vínculo de pagos + egresos del reparto. */
  async crearCorte(input: CrearCorteInput) {
    const ids = [...new Set(input.paymentIds)];
    if (ids.length === 0) throw new Error('El corte debe incluir al menos un pago');
    if (!input.dueno?.trim()) throw new Error('Indica el nombre del dueño que recibe');
    const fecha = input.fecha instanceof Date ? input.fecha : new Date(input.fecha);
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw new Error('Proyecto no encontrado');

    return prisma.$transaction(async (tx) => {
      const pagos = await tx.payment.findMany({
        where: { id: { in: ids }, status: PaymentStatus.CONFIRMED, corteId: null, contract: { projectId: input.projectId } },
        select: { id: true, amount: true, paymentDate: true, contract: { select: { projectId: true } } },
      });
      if (pagos.length !== ids.length) {
        throw new Error('Algunos pagos ya están en otro corte o no pertenecen al proyecto; recarga la lista');
      }

      const totalIngresos = round2(pagos.reduce((a, p) => a + p.amount, 0));
      const { totalEgresos, entregadoDueno } = calcularReparto(totalIngresos, input.reparto);
      const fechas = pagos.map(p => p.paymentDate.getTime());
      const ultimo = await tx.corte.findFirst({ where: { projectId: input.projectId }, orderBy: { numero: 'desc' }, select: { numero: true } });

      const corte = await tx.corte.create({
        data: {
          projectId: input.projectId,
          numero: (ultimo?.numero ?? 0) + 1,
          fecha,
          periodoInicio: new Date(Math.min(...fechas)),
          periodoFin: new Date(Math.max(...fechas)),
          totalIngresos,
          totalEgresos,
          entregadoDueno,
          dueno: input.dueno.trim(),
          notas: input.notas?.trim() || null,
          createdById: input.userId,
        },
      });

      await tx.payment.updateMany({ where: { id: { in: ids } }, data: { corteId: corte.id } });

      const etiqueta = `Corte #${corte.numero} ${project.code} ${fecha.toISOString().slice(0, 10)}`;
      const egresos = [
        ...input.reparto.filter(r => r.amount > 0).map(r => ({ categoryId: r.categoryId, amount: r.amount, description: etiqueta })),
        ...(entregadoDueno > 0 ? [{ categoryId: input.duenoCategoryId, amount: entregadoDueno, description: `${etiqueta} — entregado a ${input.dueno.trim()}` }] : []),
      ].map(e => ({ ...e, date: fecha, projectId: input.projectId, corteId: corte.id, createdById: input.userId }));
      if (egresos.length) await tx.expense.createMany({ data: egresos });

      return corte;
    });
  },
};

export default corteService;
