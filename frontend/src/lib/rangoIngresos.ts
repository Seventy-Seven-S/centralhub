/**
 * Rangos de la gráfica de ingresos mensuales.
 *
 * El recorte se hace en el navegador: el tablero ya trae la serie completa
 * desde el primer pago, así que cambiar de rango no cuesta otra petición.
 */
export interface PuntoMensual {
  periodo: string;
  mes: string;
  total: number;
}

export interface Rango {
  /** Meses hacia atrás; null = toda la historia. */
  meses: number | null;
  etiqueta: string;
}

export const RANGOS: Rango[] = [
  { meses: 6,    etiqueta: '6 meses' },
  { meses: 12,   etiqueta: '12 meses' },
  { meses: 18,   etiqueta: '18 meses' },
  { meses: 24,   etiqueta: '24 meses' },
  { meses: null, etiqueta: 'Todo' },
];

export function recortarSerie<T>(serie: T[], meses: number | null): T[] {
  return meses === null ? serie : serie.slice(-meses);
}

/**
 * Solo los rangos que aportan algo. Ofrecer "24 meses" cuando el proyecto lleva
 * 8 mostraría exactamente lo mismo que "Todo" y hace dudar de la cifra.
 */
export function rangosDisponibles(totalMeses: number): Rango[] {
  if (totalMeses <= 0) return [];
  return RANGOS.filter(r => r.meses === null || r.meses <= totalMeses);
}

/**
 * Etiqueta del eje X: "Mar 2026" → "Mar '26".
 *
 * Antes se cortaba el año ("Mar" a secas) y con 24 meses o más aparecía el
 * mismo mes varias veces sin forma de distinguir el año.
 */
export function etiquetaEje(mes: string): string {
  const [nombre, anio] = mes.split(' ');
  return anio ? `${nombre} '${anio.slice(-2)}` : (nombre ?? '');
}
