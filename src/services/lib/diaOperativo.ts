/**
 * El "día" del negocio, que no es el del servidor.
 *
 * Railway corre en UTC y la inmobiliaria opera en Matamoros (UTC−6). A las
 * 8 de la noche allá, en UTC ya es el día siguiente. Calcular el corte con la
 * hora del servidor hacía que los cobros de la tarde cayeran en el corte del
 * día siguiente y que "Mi corte del día" apareciera vacío justo cuando la
 * cobradora va a cerrar.
 *
 * `paymentDate` se guarda como fecha sin hora (medianoche UTC), así que el
 * rango se arma sobre ese mismo eje y no sobre horas locales.
 */
export const ZONA_NEGOCIO = 'America/Matamoros';

/** Fecha operativa en formato YYYY-MM-DD, según la zona del negocio. */
export function fechaOperativa(instante: Date = new Date()): string {
  // en-CA da directamente YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_NEGOCIO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instante);
}

/** Rango [00:00, 23:59:59.999] UTC de la fecha operativa. */
export function rangoDelDiaOperativo(instante: Date = new Date()): { desde: Date; hasta: Date; fecha: string } {
  const fecha = fechaOperativa(instante);
  return {
    fecha,
    desde: new Date(`${fecha}T00:00:00.000Z`),
    hasta: new Date(`${fecha}T23:59:59.999Z`),
  };
}
