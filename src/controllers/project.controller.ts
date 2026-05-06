import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, asyncHandler } from '../middlewares/errorHandler';

export const getAllProjects = asyncHandler(async (req: Request, res: Response) => {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { contracts: true } },
    },
  });

  const enriched = await Promise.all(
    projects.map(async (p) => {
      const [lotesVendidos, lotesDisponibles, totalIngresos] = await Promise.all([
        prisma.lot.count({ where: { projectId: p.id, status: 'SOLD' } }),
        prisma.lot.count({ where: { projectId: p.id, status: 'AVAILABLE' } }),
        prisma.payment.aggregate({
          where: { contract: { projectId: p.id }, status: 'CONFIRMED' },
          _sum: { amount: true },
        }),
      ]);

      const { _count, ...project } = p;
      return {
        ...project,
        totalContratos:   _count.contracts,
        lotesVendidos,
        lotesDisponibles,
        totalIngresos:    totalIngresos._sum.amount ?? 0,
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
