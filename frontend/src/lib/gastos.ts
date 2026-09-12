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
