/**
 * Informe por proyecto: ingresos y egresos de cada mes, desde el primer mes
 * con movimiento hasta hoy. Lo pidió el arquitecto para reportar de forma
 * resumida, sin desglose por tipo de pago ni por categoría de gasto, y es
 * también lo que consulta un socio de sus proyectos.
 *
 * Lógica pura: quien llama decide qué cuenta como ingreso (ver ingresoReal.ts)
 * y le pasa los movimientos ya filtrados.
 */
import { round2 } from '../../utils/money';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export interface Movimiento {
  fecha: Date;
  /** Prisma entrega los Decimal como texto. */
  monto: number | string | null;
}

export interface FilaInforme {
  /** "YYYY-MM": ordenable, para el Excel y para comparar. */
  periodo: string;
  /** "Ene 2026": lo que se lee en pantalla. */
  mes: string;
  ingresos: number;
  egresos: number;
}

export interface InformeMensual {
  filas: FilaInforme[];
  totales: { ingresos: number; egresos: number };
}

const clave = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const inicioDeMes = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);

function sumarPorMes(movs: Movimiento[]) {
  const suma = new Map<string, number>();
  for (const x of movs) suma.set(clave(x.fecha), (suma.get(clave(x.fecha)) ?? 0) + Number(x.monto ?? 0));
  return suma;
}

export function construirInformeMensual(
  ingresos: Movimiento[],
  egresos: Movimiento[],
  hasta: Date = new Date(),
): InformeMensual {
  const todos = [...ingresos, ...egresos];
  if (!todos.length) return { filas: [], totales: { ingresos: 0, egresos: 0 } };

  const porMesIngresos = sumarPorMes(ingresos);
  const porMesEgresos = sumarPorMes(egresos);
  const fechas = todos.map(x => inicioDeMes(x.fecha));
  // Hasta el mes actual, o más allá si hay algo capturado con fecha futura:
  // cortarlo haría que la fila de total no cuadrara con las de arriba.
  const fin = Math.max(inicioDeMes(hasta), ...fechas);

  const filas: FilaInforme[] = [];
  const cursor = new Date(Math.min(...fechas));
  while (cursor.getTime() <= fin) {
    const k = clave(cursor);
    filas.push({
      periodo: k,
      mes: `${MESES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
      ingresos: round2(porMesIngresos.get(k) ?? 0),
      egresos: round2(porMesEgresos.get(k) ?? 0),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return {
    filas,
    totales: {
      ingresos: round2(filas.reduce((a, f) => a + f.ingresos, 0)),
      egresos: round2(filas.reduce((a, f) => a + f.egresos, 0)),
    },
  };
}
