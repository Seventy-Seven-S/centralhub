// Contratos con más de un lote y con más de un titular.
//
// El backend siempre aceptó las dos cosas: recibe `lotIds` como lista y tiene
// cotitulares con su propio endpoint. Lo que faltaba era el formulario, que
// mandaba un solo lote y ningún cotitular.

export interface LoteElegible {
  id: string;
  manzana: number;
  lotNumber: string;
  currentPrice: number;
  areaM2: number;
}

/** Precio propuesto del contrato: la suma de los lotes. Sigue siendo editable,
 *  porque el precio pactado no siempre es la suma del catálogo. */
export function precioDeLotes(lotes: LoteElegible[]): number {
  return Math.round(lotes.reduce((s, l) => s + (l.currentPrice || 0), 0) * 100) / 100;
}

/** "M6 L-4, M6 L-5" — cómo se nombran los lotes en el resto de la app. */
export function resumenLotes(lotes: LoteElegible[]): string {
  return [...lotes]
    .sort((a, b) => a.manzana - b.manzana || Number(a.lotNumber) - Number(b.lotNumber))
    .map(l => `M${l.manzana} L-${l.lotNumber}`)
    .join(', ');
}

export interface Cotitular {
  firstName: string;
  lastName: string;
  ine: string;
  estadoCivil?: string;
  lugarNacimiento?: string;
}

/** Devuelve el mensaje de error, o null si todos los cotitulares están bien. */
export function validarCotitulares(cotitulares: Cotitular[]): string | null {
  for (let i = 0; i < cotitulares.length; i++) {
    const c = cotitulares[i];
    const cual = `cotitular ${i + 1}`;
    if (!c.firstName?.trim()) return `Falta el nombre del ${cual}`;
    if (!c.lastName?.trim()) return `Faltan los apellidos del ${cual}`;
    // El INE es lo que lo identifica en el contrato firmado.
    if (!c.ine?.trim()) return `Falta el INE del ${cual}`;
  }
  return null;
}
