// Qué dinero está pendiente de entregar al dueño del terreno.
//
// Es exactamente lo que suma el botón de generar corte: pagos confirmados del
// proyecto que todavía no se reportaron en ningún corte. Vive aquí, en un solo
// lugar, porque lo usan la pantalla de Cortes y la tarjeta de Proyectos — y ya
// nos pasó con los totales de Santander que la misma cifra calculada en dos
// lados termina diciendo dos cosas distintas.
import { Prisma, PaymentStatus, PaymentType } from '@prisma/client';
import { TIPOS_QUE_NO_SON_INGRESO } from './ingresoReal';

export function wherePendienteDeCorte(projectId: string): Prisma.PaymentWhereInput {
  return {
    status: PaymentStatus.CONFIRMED,
    corteId: null,
    contract: { projectId },
    // Un abono que viaja en un traspaso no es efectivo nuevo que entregar al
    // dueño: ese dinero ya se entregó cuando el cliente lo pagó.
    //
    // Y una DEVOLUCIÓN tampoco entra: el dinero que se le regresó al cliente
    // ya se amortizó con el dueño en su momento, así que descontarlo otra vez
    // en un corte se lo cobraría dos veces. Decisión del equipo del
    // 2026-10-05, al registrar las devoluciones de la revisión de septiembre.
    paymentType: {
      notIn: [...TIPOS_QUE_NO_SON_INGRESO, PaymentType.RESCISSION_REFUND],
    },
  };
}
