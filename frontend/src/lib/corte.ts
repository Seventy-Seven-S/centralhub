// Lógica pura del asistente de corte (sin React): totales y validación.

export interface PagoSeleccionable { id: string; amount: number; seleccionado: boolean }
export type Egresos = Record<string, string>; // categoryId → texto del input

const num = (s: string | undefined) => { const n = Number((s ?? '').trim()); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

export function resumenReparto(pagos: PagoSeleccionable[], egresos: Egresos) {
  const sel = pagos.filter(p => p.seleccionado);
  const totalIngresos = r2(sel.reduce((a, p) => a + p.amount, 0));
  const totalEgresos = r2(Object.values(egresos).reduce((a, v) => a + num(v), 0));
  return { totalIngresos, totalEgresos, entregadoDueno: r2(totalIngresos - totalEgresos), seleccionados: sel.length };
}

export function validarCorte(f: { pagos: PagoSeleccionable[]; egresos: Egresos; fecha: string }): string | null {
  if (!f.pagos.some(p => p.seleccionado)) return 'Selecciona al menos un pago';
  if (!f.fecha) return 'Indica la fecha del corte';
  if (Object.values(f.egresos).some(v => num(v) < 0)) return 'Los egresos no pueden ser negativos';
  const { totalIngresos, totalEgresos } = resumenReparto(f.pagos, f.egresos);
  if (totalEgresos > totalIngresos + 0.01) return 'Los egresos exceden el total de ingresos del corte';
  return null;
}
