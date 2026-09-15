import { resumirPorGrupo } from './resumenPorGrupo';

/**
 * Resumen y filtrado por tipo de ingreso para la pantalla de Ingresos.
 *
 * El resumen se calcula sobre lo que ya está cargado en el navegador, no en el
 * servidor: filtrar por tipo en la API devolvería solo ese tipo y entonces sería
 * imposible mostrar al mismo tiempo cuánto suman los demás.
 */

export const ETIQUETAS_TIPO: Record<string, string> = {
  DOWN_PAYMENT: 'Enganche',
  INSTALLMENT: 'Mensualidad',
  EXTRA_PAYMENT: 'Abono',
  ADJUSTMENT: 'Ajuste',
  RESCISSION_REFUND: 'Devolución',
  RESERVATION_DEPOSIT: 'Apartado',
  TRASPASO_ENTRADA: 'Traspaso',
  // Dinero que entra al proyecto sin venir de un cliente.
  OTRO_INGRESO: 'Otros ingresos',
};

/** Un tipo que no esté en el mapa se muestra con su clave: mejor un código
 *  raro en pantalla que un ingreso que desaparece del resumen. */
export function etiquetaTipo(tipo: string): string {
  return ETIQUETAS_TIPO[tipo] ?? tipo;
}

export interface ResumenTipo {
  tipo: string;
  etiqueta: string;
  pagos: number;
  monto: number;
}

export function resumirPorTipo(ingresos: Array<{ paymentType: string; amount: number }>): ResumenTipo[] {
  return resumirPorGrupo(ingresos, i => i.paymentType, i => etiquetaTipo(i.paymentType), i => i.amount)
    .map(g => ({ tipo: g.clave, etiqueta: g.etiqueta, pagos: g.cantidad, monto: g.monto }));
}

export function filtrarPorTipo<T extends { paymentType: string }>(ingresos: T[], tipo: string | null): T[] {
  return tipo ? ingresos.filter(i => i.paymentType === tipo) : ingresos;
}
