export interface DashboardSummary {
  contratos: {
    total: number;
    enMora: number;
  };
  ingresos: {
    total: number;
    totalPagos: number;
  };
  cuotas: {
    vencidasSinPagar: number;
    porStatus: Record<string, number>;
  };
  lotes: {
    total: number;
    disponibles: number;
    reservados: number;
    vendidos: number;
    porcentajeVendido: number;
  };
  distribucionPlazo: Array<{ plazoMeses: number; contratos: number }>;
}
