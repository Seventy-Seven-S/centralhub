// src/services/lot.service.ts
import { PrismaClient, LotStatus, DocumentType } from '@prisma/client';
import { CreateLotDto, UpdateLotDto, ReserveLotDto, LotFilters } from '../types/lot.types';
import { getFileStorage } from './storage';
import { buildIneKey, isIneRequired, validateIneUpload, IneFileInput } from './ineDocument';
import { logger } from '../utils/logger';
import notificationService from './notification.service';

const prisma = new PrismaClient();

export class LotService {
  // Crear un lote nuevo
  async createLot(data: CreateLotDto) {
    // Validar que el proyecto existe
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
    });

    if (!project) {
      throw new Error('Proyecto no encontrado');
    }

    // Validar que no exista otro lote con la misma manzana y número en el proyecto
    const existingLot = await prisma.lot.findFirst({
      where: {
        projectId: data.projectId,
        manzana: data.manzana,
        lotNumber: data.lotNumber,
      },
    });

    if (existingLot) {
      throw new Error(`Ya existe un lote ${data.lotNumber} en la manzana ${data.manzana}`);
    }

    // Crear el lote
    return await prisma.lot.create({
      data: {
        ...data,
        status: LotStatus.AVAILABLE,
      },
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });
  }

  // Listar lotes con filtros
  async getLots(filters: LotFilters) {
    const where: any = {};

    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.status) where.status = filters.status;
    if (filters.manzana) where.manzana = filters.manzana;
    
    if (filters.minPrice || filters.maxPrice) {
      where.currentPrice = {};
      if (filters.minPrice) where.currentPrice.gte = filters.minPrice;
      if (filters.maxPrice) where.currentPrice.lte = filters.maxPrice;
    }

    if (filters.minArea || filters.maxArea) {
      where.areaM2 = {};
      if (filters.minArea) where.areaM2.gte = filters.minArea;
      if (filters.maxArea) where.areaM2.lte = filters.maxArea;
    }

    return await prisma.lot.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        // Resumen del contrato vigente (para la ventana de detalle del lote):
        // quién lo tiene, con qué código y a qué precio se vendió.
        contracts: {
          where: { contract: { status: { notIn: ['CANCELED', 'RESCISSION'] } } },
          select: {
            priceAtSale: true,
            contract: {
              select: {
                id: true, contractNumber: true, codigoLegado: true, status: true, balance: true,
                client: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
      orderBy: [
        { manzana: 'asc' },
        { lotNumber: 'asc' },
      ],
    });
  }

  // Obtener un lote por ID
  async getLotById(id: string) {
    const lot = await prisma.lot.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        contracts: {
          include: {
            contract: {
              include: {
                client: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!lot) {
      throw new Error('Lote no encontrado');
    }

    return lot;
  }

  // Actualizar un lote
  async updateLot(id: string, data: UpdateLotDto) {
    // Verificar que el lote existe
    const lot = await prisma.lot.findUnique({ where: { id } });
    
    if (!lot) {
      throw new Error('Lote no encontrado');
    }

    // Si se intenta cambiar manzana o número, validar que no exista duplicado
    if (data.manzana || data.lotNumber) {
      const existingLot = await prisma.lot.findFirst({
        where: {
          projectId: lot.projectId,
          manzana: data.manzana || lot.manzana,
          lotNumber: data.lotNumber || lot.lotNumber,
          NOT: { id },
        },
      });

      if (existingLot) {
        throw new Error('Ya existe un lote con esa manzana y número');
      }
    }

    return await prisma.lot.update({
      where: { id },
      data,
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });
  }

  // Apartar un lote (opcionalmente con la INE del cliente que aparta)
  async reserveLot(id: string, data: ReserveLotDto, ineFile?: IneFileInput, uploadedBy?: string) {
    const lot = await prisma.lot.findUnique({ where: { id } });

    if (!lot) {
      throw new Error('Lote no encontrado');
    }

    if (lot.status !== LotStatus.AVAILABLE) {
      throw new Error('El lote no está disponible para apartar');
    }

    if (!data.clientName?.trim()) {
      throw new Error('El nombre del cliente es requerido');
    }

    if (!data.clientPhone?.trim()) {
      throw new Error('El teléfono del cliente es requerido');
    }

    const detectedIneType = await validateIneUpload(ineFile, isIneRequired());

    if (ineFile && !uploadedBy) {
      throw new Error('uploadedBy es requerido para subir la INE');
    }

    // deposit >= 0; plazo automático según monto
    const expiryWeeks = data.deposit > 0 ? 3 : 1;
    const today = new Date();
    const expiryDate = this.addBusinessWeeks(today, expiryWeeks);

    const reservationData = {
      status:             LotStatus.RESERVED,
      reservedAt:         today,
      reservationExpiry:  expiryDate,
      reservationDeposit: data.deposit,
      reservedByName:     data.clientName.trim(),
      reservedByPhone:    data.clientPhone.trim(),
      reservedByEmail:    data.clientEmail?.trim() ?? null,
      reservedByAgentId:  data.agentId ?? null,
    };
    const projectInclude = {
      project: { select: { id: true, code: true, name: true } },
    };

    let reserved;

    if (!ineFile) {
      reserved = await prisma.lot.update({
        where: { id },
        data: reservationData,
        include: projectInclude,
      });
    } else {
      // detectedIneType siempre está presente aquí: ineFile existe y
      // validateIneUpload ya lo validó (lanza si no detecta un tipo real).
      const detectedMime = detectedIneType!.mime;

      // Orden obligatorio (spec): guardar archivo → transacción DB → compensar si falla.
      // key/mimeType usan el tipo REAL detectado, no el declarado por el
      // cliente — si mintió en Content-Type y extensión, igual se guarda
      // con la extensión/mimetype correctos.
      const storage = getFileStorage();
      const key = buildIneKey(id, detectedMime);
      await storage.saveFile(key, ineFile.buffer, detectedMime);

      try {
        reserved = await prisma.$transaction(async (tx) => {
          const updated = await tx.lot.update({
            where: { id },
            data: reservationData,
            include: projectInclude,
          });
          await tx.document.create({
            data: {
              documentType:    DocumentType.INE,
              relatedEntity:   'lot',
              relatedEntityId: id,
              fileName:        ineFile.originalName,
              fileUrl:         key,
              fileSize:        ineFile.size,
              mimeType:        detectedMime,
              uploadedBy:      uploadedBy!,
            },
          });
          return updated;
        });
      } catch (err) {
        try {
          await storage.deleteFile(key);
        } catch (delErr) {
          logger.error(`Compensación fallida: archivo INE huérfano ${key} — ${delErr}`);
        }
        throw err;
      }
    }

    // Notificación in-app (fire-and-forget): nunca debe romper el apartado.
    // ADMIN (copia de todo) + MANAGER (secretaria/ventanilla).
    try {
      await notificationService.createForAudiences(
        {
          type: 'RESERVATION',
          message: `Nuevo apartado: lote ${lot.lotNumber} M${lot.manzana} — ${data.clientName.trim()}`,
          relatedEntity: 'lot',
          relatedEntityId: id,
        },
        ['ADMIN', 'MANAGER'],
      );
    } catch (err) {
      logger.error(
        `Error creando notificación de apartado para lote ${id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return reserved;
  }

  // Liberar apartado de un lote.
  // Si el apartado no llegó a contrato, la INE se elimina (registro + archivo):
  // minimización de datos LGPD — no retenemos identificaciones de no-clientes.
  async releaseReservation(id: string) {
    const lot = await prisma.lot.findUnique({ where: { id } });

    if (!lot) {
      throw new Error('Lote no encontrado');
    }

    if (lot.status !== LotStatus.RESERVED) {
      throw new Error('El lote no está apartado');
    }

    const ineDocs = await prisma.document.findMany({
      where: { relatedEntity: 'lot', relatedEntityId: id, documentType: DocumentType.INE },
    });

    const released = await prisma.$transaction(async (tx) => {
      const updated = await tx.lot.update({
        where: { id },
        data: {
          status:             LotStatus.AVAILABLE,
          reservedAt:         null,
          reservationExpiry:  null,
          reservationDeposit: null,
          reservedByName:     null,
          reservedByPhone:    null,
          reservedByEmail:    null,
          reservedByAgentId:  null,
        },
        include: {
          project: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      });

      if (ineDocs.length > 0) {
        await tx.document.deleteMany({
          where: { id: { in: ineDocs.map((d) => d.id) } },
        });
      }

      return updated;
    });

    // Borrado físico fuera de la tx: si falla, el registro ya no existe y un
    // archivo huérfano en disco es recuperable por ops — se loggea, no se revierte.
    const storage = getFileStorage();
    for (const doc of ineDocs) {
      try {
        await storage.deleteFile(doc.fileUrl);
      } catch (err) {
        logger.error(`No se pudo borrar archivo INE ${doc.fileUrl} al liberar lote ${id}: ${err}`);
      }
    }

    return released;
  }

  // Metadata de Documents INE colgados de lotes (para enriquecer respuestas).
  // Devuelve el doc más reciente por lote.
  async getIneDocumentsByLotIds(lotIds: string[]) {
    const map = new Map<string, { id: string; fileName: string; mimeType: string | null }>();
    if (lotIds.length === 0) return map;

    const docs = await prisma.document.findMany({
      where: {
        relatedEntity:   'lot',
        relatedEntityId: { in: lotIds },
        documentType:    DocumentType.INE,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, fileName: true, mimeType: true, relatedEntityId: true },
    });

    for (const d of docs) {
      if (!map.has(d.relatedEntityId)) {
        map.set(d.relatedEntityId, { id: d.id, fileName: d.fileName, mimeType: d.mimeType });
      }
    }
    return map;
  }

  // Función auxiliar: Calcular semanas hábiles (excluyendo fines de semana)
  private addBusinessWeeks(startDate: Date, weeks: number): Date {
    const result = new Date(startDate);
    let daysToAdd = weeks * 7;
    let daysAdded = 0;

    while (daysAdded < daysToAdd) {
      result.setDate(result.getDate() + 1);
      const dayOfWeek = result.getDay();
      
      // Si no es sábado (6) ni domingo (0), contar como día hábil
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        daysAdded++;
      }
    }

    return result;
  }
}

export default new LotService();