import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, asyncHandler } from '../middlewares/errorHandler';
import { whereProyectoVisible } from '../services/lib/proyectosOcultos';
import { componerTotales } from '../services/lib/totalesProyecto';
import { CONTRATOS_VIVOS, resumirLotes } from '../services/lib/conteosProyecto';
import { round2 } from '../utils/money';
import { wherePendienteDeCorte, whereGastoPorDescontar } from '../services/lib/cortePendiente';
import { whereIngresoReal } from '../services/lib/ingresoReal';
import { repartoDelProyecto, guardarAcuerdo } from '../services/reparto.service';

/**
 * Cifras de un proyecto: contratos vivos, lotes por estado y finanzas.
 *
 * Una sola función para el listado y para el detalle. Cuando esto vivía
 * duplicado en los dos endpoints, arreglar un total en uno dejaba el otro
 * mintiendo — ya pasó con los otros ingresos.
 */
async function cifrasDelProyecto(projectId: string) {
  const [contratosVivos, lotesPorEstado, valorLotes, pagos, porEntregar, porDescontar, egresos, otros] = await Promise.all([
    prisma.contract.count({ where: { projectId, status: { in: CONTRATOS_VIVOS } } }),
    prisma.lot.groupBy({ by: ['status'], where: { projectId }, _count: true }),
    // Valor total del proyecto: la suma del precio inicial de todos sus lotes.
    // Se deriva de los lotes reales, nunca de un número capturado aparte.
    prisma.lot.aggregate({ where: { projectId }, _sum: { basePrice: true } }),
    prisma.payment.aggregate({
      where: { contract: { projectId }, status: 'CONFIRMED', ...whereIngresoReal() },
      _sum: { amount: true },
    }),
    // Dinero cobrado que todavía no se le reporta al dueño: es justo lo que
    // sumaría el botón de generar corte.
    prisma.payment.aggregate({ where: wherePendienteDeCorte(projectId), _sum: { amount: true } }),
    // …menos los gastos que ese corte le va a descontar (comisiones, etc.).
    prisma.expense.aggregate({ where: whereGastoPorDescontar(projectId), _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { projectId }, _sum: { amount: true } }),
    // Dinero que entró al proyecto sin venir de un cliente (aportaciones del
    // dueño para cubrir gastos). Suma a los ingresos: si no, el gasto que
    // cubrió aparece sin su contraparte y la diferencia sale en rojo.
    prisma.otroIngreso.aggregate({ where: { projectId }, _sum: { monto: true } }),
  ]);

  const lotes = resumirLotes(lotesPorEstado as Array<{ status: any; _count: number }>);

  return {
    totalContratos:      contratosVivos,
    valorTotal:          round2(valorLotes._sum.basePrice ?? 0),
    pendientePorEntregar: round2((porEntregar._sum.amount ?? 0) - Number(porDescontar._sum.amount ?? 0)),
    // El total sale de contar los lotes reales, no del campo capturado que
    // nadie mantuvo: decía 50 en JSA 1 cuando ya había 113 lotes cargados.
    totalLotes:          lotes.total,
    lotesVendidos:       lotes.vendidos,
    lotesDisponibles:    lotes.disponibles,
    lotesReservados:     lotes.reservados,
    lotesNoDisponibles:  lotes.noDisponibles,
    ...componerTotales({
      pagos:   pagos._sum.amount,
      otros:   otros._sum.monto,
      egresos: egresos._sum.amount as unknown as string,
    }),
  };
}

export const getAllProjects = asyncHandler(async (req: Request, res: Response) => {
  // Los proyectos ocultos no salen en el selector ni en el listado. Un ADMIN
  // puede pedirlos con ?incluirOcultos=true — ocultar no es prohibir el
  // acceso, es sacarlos de la operación diaria y de los totales.
  const incluirOcultos = req.query.incluirOcultos === 'true' && req.user?.role === 'ADMIN';
  const projects = await prisma.project.findMany({
    where: whereProyectoVisible(undefined, { incluirOcultos }),
    orderBy: { createdAt: 'desc' },
  });

  const enriched = await Promise.all(
    projects.map(async (p) => ({ ...p, ...(await cifrasDelProyecto(p.id)) })),
  );

  res.status(200).json({
    status: 'success',
    data: { projects: enriched },
  });
});

export const getProjectById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const project = await prisma.project.findUnique({ where: { id } });

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  const enriched = {
    ...project,
    ...(await cifrasDelProyecto(id)),
  };

  res.status(200).json({
    status: 'success',
    data: { project: enriched },
  });
});

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const { code, name, description, location, city, state } = req.body;

  const existingProject = await prisma.project.findUnique({ where: { code } });
  if (existingProject) {
    throw new ApiError(400, 'Project code already exists');
  }

  const project = await prisma.project.create({
    data: {
      code,
      name,
      description,
      location,
      city,
      state,
      status: 'ACTIVE',
    },
  });

  res.status(201).json({
    status: 'success',
    data: { project },
  });
});

export const updateProject = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body;

  const project = await prisma.project.update({
    where: { id },
    data,
  });

  res.status(200).json({
    status: 'success',
    data: { project },
  });
});

export const deleteProject = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  await prisma.project.delete({
    where: { id },
  });

  res.status(204).send();
});

// GET /api/v1/projects/:id/reparto
export const getReparto = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ status: 'success', data: { reparto: await repartoDelProyecto(req.params.id) } });
});

// PUT /api/v1/projects/:id/reparto — solo ADMIN
export const putReparto = asyncHandler(async (req: Request, res: Response) => {
  const { porcentajeDueno, porcentajeCentral, valorBase, nota } = req.body ?? {};
  const acuerdo = await guardarAcuerdo(req.params.id, {
    porcentajeDueno: Number(porcentajeDueno),
    porcentajeCentral: Number(porcentajeCentral),
    valorBase: valorBase === undefined || valorBase === null || valorBase === '' ? undefined : Number(valorBase),
    nota,
  });
  res.status(200).json({ status: 'success', data: { acuerdo, reparto: await repartoDelProyecto(req.params.id) } });
});
