// Un pago que trae el enganche y una mensualidad juntos.
//
// Pasó con V433: el día que firmó pagó $14,000, que son $10,000 de enganche y
// $4,000 de su primera mensualidad, y el sistema viejo lo capturó como un solo
// movimiento. Mientras siga junto, el contrato queda con enganche en cero y su
// mensualidad sale calculada contra un financiado más grande del real.

import { round2 } from '../../utils/money';

export function partirPagoEnganche(
  montoDelPago: number,
  enganche: number,
): { enganche: number; resto: number } {
  if (enganche <= 0) throw new Error('El enganche debe ser mayor a cero');
  if (enganche > montoDelPago) {
    throw new Error(`El enganche (${enganche}) no puede ser mayor que el pago (${montoDelPago})`);
  }
  if (enganche === montoDelPago) {
    throw new Error('El enganche es el pago completo: eso se reclasifica, no se parte');
  }
  // El resto se deriva de la resta para que las dos partes sumen el original
  // al centavo: repartir dos cantidades capturadas a mano perdía dinero.
  return { enganche: round2(enganche), resto: round2(montoDelPago - enganche) };
}
