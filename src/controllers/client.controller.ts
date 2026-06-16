import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, asyncHandler } from '../middlewares/errorHandler';

export const getAllClients = asyncHandler(async (req: Request, res: Response) => {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      projects: {
        include: {
          project: true,
        },
      },
    },
  });

  res.status(200).json({
    status: 'success',
    data: { clients },
  });
});

export const getClientById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      projects: {
        include: {
          project: true,
        },
      },
      contracts: true,
      payments: true,
    },
  });

  if (!client) {
    throw new ApiError(404, 'Client not found');
  }

  // INE migrada al expediente del cliente (la más reciente)
  const ineDocument = await prisma.document.findFirst({
    where: { relatedEntity: 'client', relatedEntityId: id, documentType: 'INE' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, fileName: true, mimeType: true },
  });

  res.status(200).json({
    status: 'success',
    data: { client: { ...client, ineDocument } },
  });
});

export const createClient = asyncHandler(async (req: Request, res: Response) => {
  const { firstName, lastName, email, phone, projectId, projectCode } = req.body;

  const lastClient = await prisma.client.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  let nextNumber = 1;
  if (lastClient) {
    const lastNumber = parseInt(lastClient.globalCode.split('-')[1]);
    nextNumber = lastNumber + 1;
  }

  const globalCode = `CLI-${String(nextNumber).padStart(6, '0')}`;

  const client = await prisma.client.create({
    data: {
      globalCode,
      firstName,
      lastName,
      email,
      phone,
      status: 'LEAD',
    },
  });

  if (projectId) {
    await prisma.clientProject.create({
      data: {
        clientId: client.id,
        projectId,
        projectCode: projectCode || 'N/A',
      },
    });
  }

  res.status(201).json({
    status: 'success',
    data: { client },
  });
});

// Campos del cliente que un admin/manager puede editar vía PUT /clients/:id.
// Todo lo demás (id, globalCode, createdAt, updatedAt, relaciones) se ignora
// para evitar mass-assignment.
const CLIENT_EDITABLE_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'whatsappPhone',
  'address',
  'city',
  'state',
  'zipCode',
  'ine',
  'curp',
  'estadoCivil',
  'lugarNacimiento',
  'status',
  'notes',
] as const;

export const updateClient = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Whitelist: solo dejamos pasar los campos editables del body. Cualquier
  // otro campo (globalCode, id, createdAt, relaciones, etc.) se descarta.
  const data: Record<string, unknown> = {};
  for (const field of CLIENT_EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      data[field] = req.body[field];
    }
  }

  const client = await prisma.client.update({
    where: { id },
    data,
  });

  res.status(200).json({
    status: 'success',
    data: { client },
  });
});

export const deleteClient = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  await prisma.client.delete({
    where: { id },
  });

  res.status(204).send();
});
