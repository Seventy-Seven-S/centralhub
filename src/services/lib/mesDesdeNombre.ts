// "JULIO" + la fecha del contrato → "2024-07".
//
// El archivo de revisión que llenó el equipo trae el mes de la primera
// mensualidad sin año, porque para ellos es obvio. Aquí se deduce: es la
// primera vez que ocurre ese mes a partir del mes en que se firmó el contrato.
// Nadie firma en noviembre para empezar a pagar en el enero anterior.

const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

const sinAcentos = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

export function mesDesdeNombre(nombre: string, fechaContrato: Date): string | null {
  const i = MESES.indexOf(sinAcentos(nombre ?? ''));
  if (i < 0) return null;

  const mesContrato = fechaContrato.getMonth();
  const año = i < mesContrato ? fechaContrato.getFullYear() + 1 : fechaContrato.getFullYear();
  return `${año}-${String(i + 1).padStart(2, '0')}`;
}
