// Avance de ventas de un proyecto.
//
// Antes la tarjeta dividía entre vendidos + disponibles, así que un lote
// reservado o no disponible no entraba en ningún lado: JSA 2 se veía vendido
// al 100% teniendo 164 lotes y 140 vendidos. El denominador es el total real.

export interface ConteoLotes {
  totalLotes: number;
  lotesVendidos: number;
  lotesDisponibles: number;
  lotesReservados: number;
  lotesNoDisponibles: number;
}

export interface Avance {
  pct: number;
  /** "140 de 164 lotes" — para que el porcentaje sea auditable de un vistazo. */
  detalle: string;
  /** Los lotes que no están ni vendidos ni libres, o null si no hay. */
  aparte: string | null;
}

export function avanceDeVentas(c: ConteoLotes): Avance {
  if (c.totalLotes <= 0) return { pct: 0, detalle: 'sin lotes cargados', aparte: null };

  const partes: string[] = [];
  if (c.lotesReservados > 0) partes.push(`${c.lotesReservados} reservados`);
  if (c.lotesNoDisponibles > 0) partes.push(`${c.lotesNoDisponibles} no disponibles`);

  return {
    pct: Math.min(100, Math.round((c.lotesVendidos / c.totalLotes) * 100)),
    detalle: `${c.lotesVendidos} de ${c.totalLotes} lotes`,
    aparte: partes.length ? partes.join(' · ') : null,
  };
}
