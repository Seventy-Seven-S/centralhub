// Cuánto de lo pagado fue enganche y cuánto mensualidades.
//
// El estado de cuenta solo mostraba el total, y lo primero que pregunta el
// cliente es cuánto dio de enganche. El dato ya estaba en los pagos; solo
// faltaba separarlo.

export interface Pago {
  amount: number;
  paymentType: string;
  status: string;
}

/** Lo que el cliente entregó por adelantado, antes de empezar a mensualizar. */
const ES_ENGANCHE = ['DOWN_PAYMENT', 'RESERVATION_DEPOSIT'];

export function desglosarPagado(pagos: Pago[]): { enganche: number; mensualidades: number; total: number } {
  const confirmados = pagos.filter(p => p.status === 'CONFIRMED');

  const enganche = confirmados
    .filter(p => ES_ENGANCHE.includes(p.paymentType))
    .reduce((s, p) => s + p.amount, 0);

  const mensualidades = confirmados
    .filter(p => ['INSTALLMENT', 'EXTRA_PAYMENT'].includes(p.paymentType))
    .reduce((s, p) => s + p.amount, 0);

  // El total suma TODO lo confirmado, incluidas las devoluciones (que vienen
  // en negativo): es lo que de verdad queda a favor del cliente.
  const total = confirmados.reduce((s, p) => s + p.amount, 0);

  return { enganche, mensualidades, total };
}
