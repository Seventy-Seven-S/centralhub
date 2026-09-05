// src/controllers/contract.controller.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import contractService from '../services/contract.service';
import { logger } from '../utils/logger';
import { TotalUpfrontExceedsPriceError, InvalidFileSignatureError } from '../utils/errors';
import { CreateContractDto, UpdateContractDto, AddCoOwnerDto, ContractFilters } from '../types/contract.types';
import { getFileStorage } from '../services/storage';
import { validateFileSignature } from '../utils/fileSignature';

const SIGNED_CONTRACT_ALLOWED_MIMETYPES = ['application/pdf'];
// El documento de cancelación suele ser un escaneo o foto: se aceptan imágenes.
const RESCISSION_DOC_ALLOWED_MIMETYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const prisma = new PrismaClient();

export class ContractController {
  // POST /api/v1/contracts
  async create(req: Request, res: Response) {
    try {
      const data: CreateContractDto = req.body;
      const contract = await contractService.createContract(data);

      res.status(201).json({
        success: true,
        message: 'Contrato creado exitosamente',
        data: contract,
      });
    } catch (error: any) {
      if (error instanceof TotalUpfrontExceedsPriceError) {
        logger.warn('Contract creation rejected: total upfront exceeds price', {
          clientId:     req.body?.clientId,
          projectId:    req.body?.projectId,
          lotIds:       req.body?.lotIds,
          totalUpfront: error.totalUpfront,
          totalPrice:   error.totalPrice,
          agentId:      (req as any).user?.id,
        });
        return res.status(400).json({
          success:      false,
          code:         error.code,
          message:      `El total upfront (depósito + enganche al firmar = $${error.totalUpfront.toLocaleString('es-MX')}) excede el precio del lote ($${error.totalPrice.toLocaleString('es-MX')}). Ajusta el enganche o renegocia el depósito antes de continuar.`,
          totalUpfront: error.totalUpfront,
          totalPrice:   error.totalPrice,
        });
      }
      res.status(400).json({
        success: false,
        message: error.message || 'Error al crear contrato',
      });
    }
  }

  // GET /api/v1/contracts
  async getAll(req: Request, res: Response) {
    try {
      const filters: ContractFilters = {
        clientId: req.query.clientId as string,
        projectId: req.query.projectId as string,
        status: req.query.status as any,
        minBalance: req.query.minBalance ? Number(req.query.minBalance) : undefined,
        maxBalance: req.query.maxBalance ? Number(req.query.maxBalance) : undefined,
        startDateFrom: req.query.startDateFrom ? new Date(req.query.startDateFrom as string) : undefined,
        startDateTo: req.query.startDateTo ? new Date(req.query.startDateTo as string) : undefined,
      };

      const contracts = await contractService.getContracts(filters);
      
      res.status(200).json({
        success: true,
        data: contracts,
        count: contracts.length,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al obtener contratos',
      });
    }
  }

  // GET /api/v1/contracts/:id
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const contract = await contractService.getContractById(id);
      
      res.status(200).json({
        success: true,
        data: contract,
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message || 'Contrato no encontrado',
      });
    }
  }

  // PUT /api/v1/contracts/:id
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: UpdateContractDto = req.body;
      const contract = await contractService.updateContract(id, data);
      
      res.status(200).json({
        success: true,
        message: 'Contrato actualizado exitosamente',
        data: contract,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al actualizar contrato',
      });
    }
  }

  // POST /api/v1/contracts/:id/coowners
  async addCoOwner(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: AddCoOwnerDto = req.body;
      const coOwner = await contractService.addCoOwner(id, data);
      
      res.status(201).json({
        success: true,
        message: 'Co-titular agregado exitosamente',
        data: coOwner,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al agregar co-titular',
      });
    }
  }

  // PATCH /api/v1/contracts/:id/activate
  async activate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = await contractService.activateContract(id);

      res.status(200).json({
        success: true,
        message: 'Contrato activado',
        data,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al activar contrato',
      });
    }
  }

  // POST /api/v1/contracts/:id/upload-signed
  async uploadSigned(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const file = (req as any).file;

      if (!file) {
        res.status(400).json({ success: false, message: 'No se recibió ningún archivo' });
        return;
      }

      // Content-Type declarado no es confiable — se valida la firma binaria
      // real. Si pasa, ya sabemos que detected.mime === 'application/pdf'.
      const detected = await validateFileSignature(file.buffer, SIGNED_CONTRACT_ALLOWED_MIMETYPES);

      // El PDF firmado va al storage PRIVADO (contiene datos personales);
      // contractFileUrl guarda la KEY del storage, no una URL pública.
      const storageKey = `contracts/${id}/signed.pdf`;
      await getFileStorage().saveFile(storageKey, file.buffer, detected.mime);

      await prisma.contract.update({
        where: { id },
        data: { contractFileUrl: storageKey, status: 'ACTIVE' },
      });

      res.json({ success: true, data: { contractFileUrl: storageKey, status: 'ACTIVE' } });
    } catch (error: any) {
      if (error instanceof InvalidFileSignatureError) {
        res.status(400).json({ success: false, code: error.code, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: error.message || 'Error al subir el contrato' });
    }
  }

  // POST /api/v1/contracts/:id/rescind — multipart: reason, date, refundAmount
  // y opcionalmente `file` (documento de cancelación firmado, PDF/JPG/PNG).
  async rescind(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reason, date, refundAmount } = req.body ?? {};
      const file = (req as any).file;

      let fileKey: string | undefined;
      if (file) {
        const detected = await validateFileSignature(file.buffer, RESCISSION_DOC_ALLOWED_MIMETYPES);
        const ext = detected.mime === 'application/pdf' ? 'pdf' : detected.mime === 'image/png' ? 'png' : 'jpg';
        fileKey = `contracts/${id}/rescision.${ext}`;
        await getFileStorage().saveFile(fileKey, file.buffer, detected.mime);
      }

      const contract = await contractService.rescindContract(id, {
        reason,
        date: date || new Date(),
        refundAmount: refundAmount ? Number(refundAmount) : 0,
        userId: req.user?.userId,
        fileKey,
      });

      res.json({ success: true, data: contract, message: 'Contrato rescindido' });
    } catch (error: any) {
      if (error instanceof InvalidFileSignatureError) {
        res.status(400).json({ success: false, code: error.code, message: error.message });
        return;
      }
      const status = /no encontrado/i.test(error.message) ? 404 : /obligatorio|ya está|monto válido/i.test(error.message) ? 400 : 500;
      res.status(status).json({ success: false, message: error.message || 'Error al rescindir el contrato' });
    }
  }

  // GET /api/v1/contracts/:id/rescission-file — documento de cancelación
  // desde el storage privado (solo ADMIN/MANAGER, enforced en la ruta)
  async getRescissionFile(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const contract = await prisma.contract.findUnique({
        where: { id },
        select: { rescissionFileUrl: true, contractNumber: true },
      });
      if (!contract?.rescissionFileUrl) {
        res.status(404).json({ success: false, message: 'Este contrato no tiene documento de rescisión' });
        return;
      }
      const buffer = await getFileStorage().getFile(contract.rescissionFileUrl);
      const ext = contract.rescissionFileUrl.split('.').pop();
      const mime = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';

      logger.info(
        `[acceso-doc-sensible] user=${req.user?.userId ?? 'desconocido'} role=${req.user?.role ?? '?'} ` +
        `contrato=${id} archivo=rescision ip=${req.ip}`,
      );
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `inline; filename="${contract.contractNumber}-rescision.${ext}"`);
      res.send(buffer);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Error al obtener el documento de rescisión' });
    }
  }

  // GET /api/v1/contracts/:id/signed-file — sirve el PDF firmado desde el
  // storage privado (solo ADMIN/MANAGER, enforced en la ruta)
  async getSignedFile(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const contract = await prisma.contract.findUnique({
        where: { id },
        select: { contractFileUrl: true, contractNumber: true },
      });

      if (!contract?.contractFileUrl) {
        res.status(404).json({ success: false, message: 'Este contrato no tiene PDF firmado' });
        return;
      }

      const buffer = await getFileStorage().getFile(contract.contractFileUrl);

      // Log de acceso a datos sensibles (Arquitectura §7.3)
      logger.info(
        `[acceso-doc-sensible] user=${req.user?.userId ?? 'desconocido'} role=${req.user?.role ?? '?'} ` +
        `contrato=${id} archivo=contrato-firmado ip=${req.ip}`,
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${contract.contractNumber}-firmado.pdf"`);
      res.send(buffer);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Error al obtener el contrato firmado' });
    }
  }
}

export default new ContractController();