// src/routes/portal.routes.ts
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateClient } from '../middlewares/clientAuth';
import { ApiError } from '../middlewares/errorHandler';
import contractService from '../services/contract.service';
import cuotaService from '../services/cuota.service';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticateClient);

// Resolves the Client.id from the authenticated ClientUser token
async function resolveClientId(req: Request): Promise<string> {
  const clientUser = await prisma.clientUser.findUnique({
    where: { id: req.client!.userId },
    select: { clientId: true },
  });
  if (!clientUser) throw new ApiError(401, 'Cliente no encontrado');
  return clientUser.clientId;
}

// GET /api/v1/portal/contratos
router.get('/contratos', async (req: Request, res: Response) => {
  try {
    const clientId = await resolveClientId(req);
    const data = await contractService.getContracts({ clientId });
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 400;
    res.status(status).json({ success: false, message: error.message });
  }
});

// GET /api/v1/portal/contratos/:id
router.get('/contratos/:id', async (req: Request, res: Response) => {
  try {
    const clientId = await resolveClientId(req);
    const contract = await contractService.getContractById(req.params.id);
    if (contract.clientId !== clientId) {
      throw new ApiError(403, 'No tienes acceso a este contrato');
    }
    res.status(200).json({ success: true, data: contract });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 400;
    res.status(status).json({ success: false, message: error.message });
  }
});

// GET /api/v1/portal/contratos/:id/cuotas
router.get('/contratos/:id/cuotas', async (req: Request, res: Response) => {
  try {
    const clientId = await resolveClientId(req);
    const contract = await contractService.getContractById(req.params.id);
    if (contract.clientId !== clientId) {
      throw new ApiError(403, 'No tienes acceso a este contrato');
    }
    const data = await cuotaService.getCuotasByContract(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 400;
    res.status(status).json({ success: false, message: error.message });
  }
});

// GET /api/v1/portal/contratos/:id/pagos
router.get('/contratos/:id/pagos', async (req: Request, res: Response) => {
  try {
    const clientId = await resolveClientId(req);
    const contract = await contractService.getContractById(req.params.id);
    if (contract.clientId !== clientId) {
      throw new ApiError(403, 'No tienes acceso a este contrato');
    }
    const data = await prisma.payment.findMany({
      where: { contractId: req.params.id },
      orderBy: { paymentDate: 'desc' },
    });
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    const status = error instanceof ApiError ? error.statusCode : 400;
    res.status(status).json({ success: false, message: error.message });
  }
});

export default router;
