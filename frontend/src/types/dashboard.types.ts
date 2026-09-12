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
  // `periodo` ("YYYY-MM") viene del backend para poder cortar rangos sin
  // depender de la etiqueta traducida. La serie llega completa desde el primer
  // pago, con los meses sin ingresos en cero.
  ingresosPorMes: Array<{ periodo: string; mes: string; total: number }>;
  gastos: {
    total: number;
  };
}
