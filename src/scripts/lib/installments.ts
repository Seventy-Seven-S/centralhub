// Matemática pura del calendario de cuotas. Sin DB, sin Excel.

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Reparte `financiado` en `plazoMeses` cuotas.
 * Las primeras plazoMeses-1 son iguales (round2(financiado/plazoMeses));
 * la última absorbe el redondeo para que la suma sea exactamente round2(financiado).
 */
export function buildScheduleAmounts(financiado: number, plazoMeses: number): number[] {
  if (plazoMeses <= 0) return [];
  const base = round2(financiado / plazoMeses);
  const amounts: number[] = [];
  for (let i = 0; i < plazoMeses - 1; i++) amounts.push(base);
  const ultima = round2(round2(financiado) - base * (plazoMeses - 1));
  amounts.push(ultima);
  return amounts;
}
