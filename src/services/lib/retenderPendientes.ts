/**
 * Re-tiende SOLO las cuotas pendientes de un contrato con una mensualidad
 * nueva, dejando intactas las que ya se pagaron.
 *
 * Por qué no se regenera el calendario completo: las cuotas pagadas guardan la
 * fecha y el monto reales del pago, que son historia y no se recalculan. Y si
 * una cuota que se pagó con $2,604.17 pasara a esperar $2,605, quedaría
 * incompleta por $0.83 y el job de mora la marcaría vencida — se inventaría
 * mora que nunca existió, en miles de cuotas a la vez.
 *
 * Lo que sí cambia es el futuro: las pendientes se re-tienden con el monto
 * correcto y la última absorbe el residuo, de modo que la suma de lo pendiente
 * cuadra exacto contra el balance del contrato.
 */
import { buildScheduleFromInstallment } from './installmentSchedule';
import { addMonthsClamped } from './cuotaSchedule';
import { round2 } from '../../utils/money';

export interface CuotaExistente {
  numeroCuota: number;
  montoEsperado: number;
  montoPagado: number;
  status: 'PAGADA' | 'PENDIENTE';
  fechaVencimiento: Date;
}

export interface CuotaRetendida {
  numeroCuota: number;
  montoEsperado: number;
  montoPagado: number;
  status: 'PAGADA' | 'PENDIENTE';
  fechaVencimiento: Date;
  mes: string;
}

export interface ResultadoRetendido {
  /** Cuotas pagadas, sin tocar. */
  conservadas: CuotaExistente[];
  /** Cuotas pendientes con el monto nuevo. */
  nuevas: CuotaRetendida[];
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesLabel = (d: Date) => `${MESES[d.getMonth()]} de ${d.getFullYear()}`;

export function retenderPendientes(
  cuotas: CuotaExistente[],
  balance: number,
  nuevaMensualidad: number,
): ResultadoRetendido {
  const ordenadas = [...cuotas].sort((a, b) => a.numeroCuota - b.numeroCuota);
  const conservadas = ordenadas.filter(c => c.status === 'PAGADA');
  const pendientesViejas = ordenadas.filter(c => c.status !== 'PAGADA');

  const saldo = round2(balance);
  if (saldo <= 0) return { conservadas, nuevas: [] };

  // Un abono parcial ya aplicado a la primera pendiente no se puede perder:
  // se reinyecta en la primera cuota nueva.
  const abonoParcial = round2(pendientesViejas.reduce((a, c) => a + (c.montoPagado ?? 0), 0));

  const { cuotaAmounts } = buildScheduleFromInstallment(round2(saldo + abonoParcial), nuevaMensualidad);

  // La numeración y las fechas continúan donde iba el calendario: se respeta
  // el día del mes que el contrato ya tenía.
  const ancla = pendientesViejas[0]?.fechaVencimiento
    ?? (conservadas.length
      ? addMonthsClamped(conservadas[conservadas.length - 1].fechaVencimiento, 1)
      : new Date());
  const primerNumero = pendientesViejas[0]?.numeroCuota ?? (conservadas.at(-1)?.numeroCuota ?? 0) + 1;

  let restaAbono = abonoParcial;
  const nuevas: CuotaRetendida[] = cuotaAmounts.map((monto, i) => {
    const aplicado = Math.min(restaAbono, monto);
    restaAbono = round2(restaAbono - aplicado);
    const fecha = addMonthsClamped(ancla, i);
    return {
      numeroCuota: primerNumero + i,
      montoEsperado: monto,
      montoPagado: round2(aplicado),
      status: aplicado >= monto - 0.005 ? 'PAGADA' : 'PENDIENTE',
      fechaVencimiento: fecha,
      mes: mesLabel(fecha),
    };
  });

  return { conservadas, nuevas };
}
