// El mes en que cae la PRIMERA MENSUALIDAD del cliente.
//
// El calendario de cuotas ancla en `startDate` y la cuota i vence en
// `startDate + i meses`, así que la cuota 1 cae un mes DESPUÉS de esa fecha.
// La pantalla pedía "Fecha de inicio" y nadie veía esa relación: al dar de
// alta un 24 de septiembre, la primera mensualidad salía en octubre sin que
// quedara claro por qué ni cómo cambiarlo.
//
// Ahora se captura el mes tal como lo piensa la secretaria —después del día 20
// le dan al cliente la opción de arrancar el mes siguiente— y de ahí se deriva
// la fecha de inicio.

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** "2026-09-24" → "2026-10". El mes que sigue al de esa fecha. */
export function mesSiguienteA(fechaISO: string): string {
  const [a, m] = fechaISO.split('-').map(Number);
  const d = new Date(a, m, 1); // m (1-based) como índice 0-based = mes siguiente
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}`;
}

/**
 * Fecha de inicio que hace que la cuota 1 caiga en `mes`.
 *
 * Conserva el DÍA de la fecha del contrato, que es el día de pago del cliente,
 * y lo recorta si el mes destino no lo tiene (no existe el 31 de febrero).
 */
export function fechaInicioDesdeMes(mes: string, fechaContratoISO: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return fechaContratoISO;

  const dia = Number(fechaContratoISO.split('-')[2]) || 1;
  const [a, m] = mes.split('-').map(Number);

  // Un mes antes del mes de la primera cuota.
  const año = m === 1 ? a - 1 : a;
  const mesAncla = m === 1 ? 12 : m - 1;

  const ultimoDia = new Date(año, mesAncla, 0).getDate();
  return `${año}-${dosDigitos(mesAncla)}-${dosDigitos(Math.min(dia, ultimoDia))}`;
}
