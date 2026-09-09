// Forma del dashboard que ve un MANAGER (las secretarias).
//
// Motivo: el dashboard completo abre con Ingresos / Egresos / Diferencia del
// negocio entero, y las secretarias lo tienen en pantalla mientras atienden a
// un cliente enfrente. No es solo estética — es información del negocio
// expuesta a terceros, y ellas no la usan para trabajar.
//
// Regla dura: aquí NO entra ningún total del negocio. El único monto que
// aparece es el de los cobros que esa persona hizo hoy, que es su propia
// operación y el insumo de su corte diario.

export interface DatosOperativos {
  misCobrosHoy: { total: number; count: number };
  cuotasVencidas: number;
  cuotasVencenEstaSemana: number;
  apartadosPorVencer: number;
  contratosActivos: number;
  lotesDisponibles: number;
}

export interface DashboardOperativo {
  misCobrosHoy: { total: number; count: number };
  porCobrar: { vencidas: number; vencenEstaSemana: number };
  apartadosPorVencer: number;
  inventario: { contratosActivos: number; lotesDisponibles: number };
}

/** Puro, sin Prisma — para poder probar la forma sin base de datos. */
export function construirDashboardOperativo(d: DatosOperativos): DashboardOperativo {
  return {
    misCobrosHoy: { total: d.misCobrosHoy.total, count: d.misCobrosHoy.count },
    porCobrar: { vencidas: d.cuotasVencidas, vencenEstaSemana: d.cuotasVencenEstaSemana },
    apartadosPorVencer: d.apartadosPorVencer,
    inventario: { contratosActivos: d.contratosActivos, lotesDisponibles: d.lotesDisponibles },
  };
}
