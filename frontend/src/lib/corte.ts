// Lógica pura del asistente de corte (sin React): totales y validación.

export interface PagoSeleccionable { id: string; amount: number; seleccionado: boolean }
export type Egresos = Record<string, string>; // categoryId → texto del input

const num = (s: string | undefined) => { const n = Number((s ?? '').trim()); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

// Los gastos por descontar (comisiones, etc.) usan la misma forma que los pagos:
// ya existen como gasto y solo se eligen cuáles entran a este corte.
export function resumenReparto(pagos: PagoSeleccionable[], egresos: Egresos, gastos: PagoSeleccionable[] = []) {
  const sel = pagos.filter(p => p.seleccionado);
  const totalIngresos = r2(sel.reduce((a, p) => a + p.amount, 0));
  const totalGastos = r2(gastos.filter(g => g.seleccionado).reduce((a, g) => a + g.amount, 0));
  const totalEgresos = r2(Object.values(egresos).reduce((a, v) => a + num(v), 0) + totalGastos);
  return { totalIngresos, totalEgresos, totalGastos, entregadoDueno: r2(totalIngresos - totalEgresos), seleccionados: sel.length };
}

export function validarCorte(f: { pagos: PagoSeleccionable[]; egresos: Egresos; fecha: string; gastos?: PagoSeleccionable[] }): string | null {
  if (!f.pagos.some(p => p.seleccionado)) return 'Selecciona al menos un pago';
  if (!f.fecha) return 'Indica la fecha del corte';
  if (Object.values(f.egresos).some(v => num(v) < 0)) return 'Los egresos no pueden ser negativos';
  const { totalIngresos, totalEgresos } = resumenReparto(f.pagos, f.egresos, f.gastos);
  if (totalEgresos > totalIngresos + 0.01) return 'Los egresos exceden el total de ingresos del corte';
  return null;
}
