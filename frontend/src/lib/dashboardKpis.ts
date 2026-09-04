export interface DashboardKpiInput {
  ingresos: { total: number; totalPagos: number };
  gastos?: { total: number; count?: number };
}

export interface DashboardKpi {
  title: string;
  amount: number;
  subtitle?: string;
  accent: string;
}

const VERDE = '#22C55E';
const ROJO = '#EF4444';

/** Las 3 tarjetas del resumen: ingresos, egresos y su diferencia. */
export function buildDashboardKpis({ ingresos, gastos }: DashboardKpiInput): DashboardKpi[] {
  const egresos = gastos?.total ?? 0;
  const diferencia = ingresos.total - egresos;
  return [
    { title: 'Ingresos totales', amount: ingresos.total, subtitle: `${ingresos.totalPagos} pagos registrados`, accent: VERDE },
    { title: 'Egresos totales', amount: egresos, subtitle: gastos?.count != null ? `${gastos.count} gastos registrados` : undefined, accent: ROJO },
    { title: 'Diferencia', amount: diferencia, subtitle: 'Ingresos − Egresos', accent: diferencia >= 0 ? VERDE : ROJO },
  ];
}
