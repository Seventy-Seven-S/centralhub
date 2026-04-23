// src/services/lot.service.ts
import { PrismaClient, LotStatus } from '@prisma/client';
import { CreateLotDto, UpdateLotDto, ReserveLotDto, LotFilters } from '../types/lot.types';

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

  // Apartar un lote
  async reserveLot(id: string, data: ReserveLotDto) {
    const lot = await prisma.lot.findUnique({ where: { id } });

    if (!lot) {
      throw new Error('Lote no encontrado');
    }

    if (lot.status !== LotStatus.AVAILABLE) {
      throw new Error('El lote no está disponible para apartar');
    }

    // Validar monto de apartado
    if (data.reservationDeposit !== 0 && data.reservationDeposit !== 5000) {
      throw new Error('El apartado debe ser $0 (palabra) o $5,000 (con pago)');
    }

    // Validar plazo según monto
    if (data.reservationDeposit === 0 && data.expiryWeeks !== 1) {
      throw new Error('Apartado de palabra debe ser 1 semana');
    }

    if (data.reservationDeposit === 5000 && data.expiryWeeks !== 3) {
      throw new Error('Apartado con pago debe ser 3 semanas');
    }

    // Calcular fecha de expiración (semanas hábiles)
    const today = new Date();
    const expiryDate = this.addBusinessWeeks(today, data.expiryWeeks);

    return await prisma.lot.update({
      where: { id },
      data: {
        status: LotStatus.RESERVED,
        reservedAt: today,
        reservationExpiry: expiryDate,
        reservationDeposit: data.reservationDeposit,
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

  // Liberar apartado de un lote
  async releaseReservation(id: string) {
    const lot = await prisma.lot.findUnique({ where: { id } });

    if (!lot) {
      throw new Error('Lote no encontrado');
    }

    if (lot.status !== LotStatus.RESERVED) {
      throw new Error('El lote no está apartado');
    }

    return await prisma.lot.update({
      where: { id },
      data: {
        status: LotStatus.AVAILABLE,
        reservedAt: null,
        reservationExpiry: null,
        reservationDeposit: null,
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