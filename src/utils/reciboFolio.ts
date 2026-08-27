// Espejo exacto de buildReciboFolio en frontend/src/components/pdf/reciboHelpers.ts
// — mismo formato, derivado, no persiste. Existe una copia en cada lado
// porque frontend y backend no comparten código; si se toca uno, tocar
// el otro.
export function buildReciboFolio(codigo: string, numeroCuota: number, plazoTotal: number): string {
  return `REC-${codigo}-${numeroCuota}de${plazoTotal}`;
}
