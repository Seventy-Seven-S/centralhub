// Acuerdo de reparto de un proyecto y qué tanto se ha cumplido.
//
// Lo entregado NO se captura aparte: sale de los gastos del proyecto en las
// categorías "Dueño del terreno" y "Central", que es donde el equipo lleva
// registrando estas entregas desde siempre. Pedirles capturarlo dos veces
// garantizaría que los dos números se separen.
import { prisma } from '../config/database';
import { calcularReparto, Reparto } from './lib/repartoProyecto';

// Nombres tal como existen en expense_categories.
export const CATEGORIA_DUENO = 'Dueño del terreno';
export const CATEGORIA_CENTRAL = 'Central';

async function sumarCategoria(projectId: string, nombre: string): Promise<number> {
  const r = await prisma.expense.aggregate({
    where: { projectId, category: { name: nombre } },
    _sum: { amount: true },
  });
  return Number(r._sum.amount ?? 0);
}

export interface RepartoDelProyecto extends Reparto {
  nota: string | null;
  actualizadoAt: Date;
}

/** null si el proyecto no tiene acuerdo — la mayoría no lo tiene. */
export async function repartoDelProyecto(projectId: string): Promise<RepartoDelProyecto | null> {
  const acuerdo = await prisma.acuerdoReparto.findUnique({ where: { projectId } });
  if (!acuerdo) return null;

  const [entregadoDueno, tomadoCentral] = await Promise.all([
    sumarCategoria(projectId, CATEGORIA_DUENO),
    sumarCategoria(projectId, CATEGORIA_CENTRAL),
  ]);

  return {
    ...calcularReparto(acuerdo, { entregadoDueno, tomadoCentral }),
    nota: acuerdo.nota,
    actualizadoAt: acuerdo.updatedAt,
  };
}

export interface GuardarAcuerdo {
  porcentajeDueno: number;
  porcentajeCentral: number;
  /** Si no se manda, se toma el valor del inventario de HOY y se congela. */
  valorBase?: number;
  nota?: string | null;
}

export async function guardarAcuerdo(projectId: string, datos: GuardarAcuerdo) {
  const suma = datos.porcentajeDueno + datos.porcentajeCentral;
  if (Math.abs(suma - 100) > 0.01) throw new Error(`Los porcentajes suman ${suma}, deben sumar 100`);
  if (datos.porcentajeDueno < 0 || datos.porcentajeCentral < 0) throw new Error('Los porcentajes no pueden ser negativos');

  const proyecto = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!proyecto) throw new Error('Proyecto no encontrado');

  let valorBase = datos.valorBase;
  if (valorBase === undefined) {
    const v = await prisma.lot.aggregate({ where: { projectId }, _sum: { basePrice: true } });
    valorBase = Number(v._sum.basePrice ?? 0);
  }
  if (valorBase <= 0) throw new Error('El valor base debe ser mayor a cero — carga primero el inventario con sus precios');

  return prisma.acuerdoReparto.upsert({
    where: { projectId },
    create: { projectId, porcentajeDueno: datos.porcentajeDueno, porcentajeCentral: datos.porcentajeCentral, valorBase, nota: datos.nota ?? null },
    // El valorBase solo se toca si se manda explícitamente: renegociar el trato
    // es una decisión, no un efecto secundario de editar la nota.
    update: {
      porcentajeDueno: datos.porcentajeDueno,
      porcentajeCentral: datos.porcentajeCentral,
      nota: datos.nota ?? null,
      ...(datos.valorBase !== undefined ? { valorBase: datos.valorBase } : {}),
    },
  });
}
