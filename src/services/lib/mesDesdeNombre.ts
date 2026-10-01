// "JULIO" + una fecha de referencia → "2024-07".
//
// El archivo de revisión que llenó el equipo trae el mes de la primera
// mensualidad sin año, porque para ellos es obvio. Aquí se deduce.
//
// Se elige la ocurrencia MÁS CERCANA al ancla, que puede quedar antes o
// después. Anclar en la fecha del contrato y buscar hacia adelante estaba mal:
// esa fecha es cuándo se registró en el sistema, no cuándo firmó el cliente, y
// en Magnolia varios ya venían pagando desde antes. Eso movía sus calendarios
// hasta diez meses en la dirección equivocada.

const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

const sinAcentos = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

/**
 * @param ancla fecha contra la cual se mide la cercanía. Debe ser el PRIMER
 *   PAGO del cliente cuando lo haya: es lo que de verdad dice cuándo empezó a
 *   pagar. La fecha del contrato solo sirve de respaldo.
 */
export function mesDesdeNombre(nombre: string, ancla: Date): string | null {
  const i = MESES.indexOf(sinAcentos(nombre ?? ''));
  if (i < 0) return null;

  const añoAncla = ancla.getUTCFullYear();
  const mesAncla = ancla.getUTCMonth();

  // Tres candidatos: el año anterior, el mismo y el siguiente. Gana el que
  // quede a menos meses de distancia; en empate, el que no retrocede.
  const candidatos = [añoAncla - 1, añoAncla, añoAncla + 1].map(año => ({
    año,
    distancia: Math.abs((año - añoAncla) * 12 + (i - mesAncla)),
    haciaAtras: (año - añoAncla) * 12 + (i - mesAncla) < 0,
  }));
  candidatos.sort((a, b) => a.distancia - b.distancia || Number(a.haciaAtras) - Number(b.haciaAtras));

  return `${candidatos[0].año}-${String(i + 1).padStart(2, '0')}`;
}
