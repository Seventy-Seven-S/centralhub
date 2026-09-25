// Qué dinero está pendiente de entregar al dueño del terreno.
//
// Es exactamente lo que suma el botón de generar corte: pagos confirmados del
// proyecto que todavía no se reportaron en ningún corte. Vive aquí, en un solo
// lugar, porque lo usan la pantalla de Cortes y la tarjeta de Proyectos — y ya
// nos pasó con los totales de Santander que la misma cifra calculada en dos
// lados termina diciendo dos cosas distintas.
import { Prisma, PaymentStatus } from '@prisma/client';
import { whereIngresoReal } from './ingresoReal';

export function wherePendienteDeCorte(projectId: string): Prisma.PaymentWhereInput {
  return {
    status: PaymentStatus.CONFIRMED,
    corteId: null,
    contract: { projectId },
    // Un abono que viaja en un traspaso no es efectivo nuevo que entregar al
    // dueño: ese dinero ya se entregó cuando el cliente lo pagó.
    ...whereIngresoReal(),
  };
}
