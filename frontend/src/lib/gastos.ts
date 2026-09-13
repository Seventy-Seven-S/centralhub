/**
 * Resumen y filtrado por categoría para la pantalla de Gastos.
 *
 * El filtro se aplica en el navegador, no en la API: pedirle al servidor una
 * sola categoría haría imposible mostrar al mismo tiempo cuánto suman las
 * demás, que es justo lo que se quiere ver de un vistazo.
 */
import { resumirPorGrupo, type ResumenGrupo } from './resumenPorGrupo';

/** Lo mínimo que se necesita de un gasto. `amount` llega como texto: Prisma
 *  serializa Decimal así, y sumarlo sin convertir concatena en vez de sumar. */
interface GastoResumible {
  categoryId: string;
  category: { name: string };
  amount: string | number;
}

export function resumirGastosPorCategoria(gastos: GastoResumible[]): ResumenGrupo[] {
  return resumirPorGrupo(gastos, g => g.categoryId, g => g.category.name, g => Number(g.amount));
}

export function filtrarPorCategoria<T extends { categoryId: string }>(gastos: T[], categoryId: string | null): T[] {
  return categoryId ? gastos.filter(g => g.categoryId === categoryId) : gastos;
}

/** Lo mínimo para agrupar un gasto por proyecto. */
interface GastoConProyecto {
  projectId: string;
  project?: { code?: string; name?: string };
  amount: string | number;
}

/**
 * Desglose por proyecto de un conjunto de gastos, para responder "de los
 * $12.6M de Despacho, ¿cuánto fue en cada proyecto?".
 *
 * Se etiqueta con el CÓDIGO (VDR, MON1) y no con el nombre: es como el equipo
 * los nombra y caben varios en una línea de chips.
 */
export function resumirGastosPorProyecto(gastos: GastoConProyecto[]): ResumenGrupo[] {
  return resumirPorGrupo(
    gastos,
    g => g.projectId,
    g => g.project?.code ?? g.project?.name ?? g.projectId,
    g => Number(g.amount),
  );
}

export function filtrarPorProyecto<T extends { projectId: string }>(gastos: T[], projectId: string | null): T[] {
  return projectId ? gastos.filter(g => g.projectId === projectId) : gastos;
}
