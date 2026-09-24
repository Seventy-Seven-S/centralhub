// Cuánto lleva pagado un contrato.
//
// Se suma de los PAGOS REALES. Antes se deducía restando el balance al precio,
// y eso mentía en cuanto el balance dejaba de significar "lo que falta": al
// rescindir un contrato el balance se pone en cero porque ya no se debe nada,
// y la pantalla concluía que el cliente había pagado el terreno completo.
// V037 aparecía con $235,000 pagados cuando llevaba $58,520.

export interface DatosContrato {
  totalPrice: number;
  balance: number;
  status: string;
}

export interface PagoLike {
  amount: number;
  status: string;
}

/** Contratos que ya no están en curso: lo pagado es historia, no avance. */
const TERMINADOS = ['RESCISSION', 'CANCELED', 'COMPLETED', 'TRASPASADO'];

export interface ResumenPagado {
  pagado: number;
  /** Porcentaje del precio que el cliente alcanzó a cubrir. Tope 100. */
  pct: number;
  contratoTerminado: boolean;
}

export function resumenPagado(contrato: DatosContrato, pagos: PagoLike[]): ResumenPagado {
  const pagado = pagos
    .filter(p => p.status === 'CONFIRMED')
    .reduce((s, p) => s + p.amount, 0);

  const pct = contrato.totalPrice > 0
    ? Math.min(100, Math.round((pagado / contrato.totalPrice) * 100))
    : 0;

  return {
    pagado: Math.round(pagado * 100) / 100,
    pct,
    contratoTerminado: TERMINADOS.includes(contrato.status),
  };
}
