import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, asyncHandler } from '../middlewares/errorHandler';
import { whereProyectoVisible } from '../services/lib/proyectosOcultos';

export const getAllProjects = asyncHandler(async (req: Request, res: Response) => {
  // Los proyectos ocultos no salen en el selector ni en el listado. Un ADMIN
  // puede pedirlos con ?incluirOcultos=true — ocultar no es prohibir el
  // acceso, es sacarlos de la operación diaria y de los totales.
  const incluirOcultos = req.query.incluirOcultos === 'true' && req.user?.role === 'ADMIN';
  const projects = await prisma.project.findMany({
    where: whereProyectoVisible(undefined, { incluirOcultos }),
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { contracts: true } },
    },
  });

  const enriched = await Promise.all(
    projects.map(async (p) => {
      const [lotesVendidos, lotesDisponibles, totalIngresos, totalEgresos, otrosIngresos] = await Promise.all([
        prisma.lot.count({ where: { projectId: p.id, status: 'SOLD' } }),
        prisma.lot.count({ where: { projectId: p.id, status: 'AVAILABLE' } }),
        prisma.payment.aggregate({
          where: { contract: { projectId: p.id }, status: 'CONFIRMED' },
          _sum: { amount: true },
        }),
        prisma.expense.aggregate({ where: { projectId: p.id }, _sum: { amount: true } }),
        // Dinero que entró al proyecto sin venir de un cliente (aportaciones
        // del dueño para cubrir gastos). Suma a los ingresos: si no, el gasto
        // que cubrió aparece sin su contraparte y la diferencia sale en rojo.
        prisma.otroIngreso.aggregate({ where: { projectId: p.id }, _sum: { monto: true } }),
      ]);

      const { _count, ...project } = p;
      return {
        ...project,
        totalContratos:   _count.contracts,
        lotesVendidos,
        lotesDisponibles,
        totalIngresos:    (totalIngresos._sum.amount ?? 0) + (otrosIngresos._sum.monto ?? 0),
        // Aparte para poder distinguirlo de lo cobrado a clientes.
        otrosIngresos:    otrosIngresos._sum.monto ?? 0,
        // Number() porque el monto de un gasto es Decimal: sin convertir, el
        // frontend recibe una cadena y la resta concatena en vez de restar.
        totalEgresos:     Number(totalEgresos._sum.amount ?? 0),
      };
    })
  );

  res.status(200).json({
    status: 'success',
    data: { projects: enriched },
  });
});

export const getProjectById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      _count: { select: { contracts: true } },
    },
  });

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  const [lotesVendidos, lotesDisponibles, totalIngresos] = await Promise.all([
    prisma.lot.count({ where: { projectId: id, status: 'SOLD' } }),
    prisma.lot.count({ where: { projectId: id, status: 'AVAILABLE' } }),
    prisma.payment.aggregate({
      where: { contract: { projectId: id }, status: 'CONFIRMED' },
      _sum: { amount: true },
    }),
  ]);

  const { _count, ...rest } = project;
  const enriched = {
    ...rest,
    totalContratos:   _count.contracts,
    lotesVendidos,
    lotesDisponibles,
    totalIngresos:    totalIngresos._sum.amount ?? 0,
  };

  res.status(200).json({
    status: 'success',
    data: { project: enriched },
  });
});

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const { code, name, description, location, city, state, totalLots } = req.body;

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
      totalLots,
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
