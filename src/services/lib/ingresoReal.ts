// Qué cuenta como ingreso del proyecto.
//
// No todo pago registrado es dinero que entró. Un traspaso a otro lote crea un
// pago en el contrato destino por lo que se le respetó al cliente, pero ese
// dinero ya se había contado cuando el cliente lo pagó en el contrato de
// origen, cuyos pagos siguen ahí. Sumar los dos duplicaría los ingresos.
//
// Vive en un solo lugar a propósito: el mismo total calculado en la tarjeta
// del proyecto, el tablero, los cortes y la pantalla de ingresos tiene que
// significar lo mismo. Ya nos pasó con Santander que la misma cifra vivía en
// tres lados y arreglar uno dejaba a los otros mintiendo.
import { PaymentType, Prisma } from '@prisma/client';

export const TIPOS_QUE_NO_SON_INGRESO: PaymentType[] = [
  PaymentType.TRASPASO_ENTRADA,
];

/** Filtro para las consultas que suman ingresos. */
export function whereIngresoReal(): Prisma.PaymentWhereInput {
  return { paymentType: { notIn: TIPOS_QUE_NO_SON_INGRESO } };
}

/** La misma regla, para filtrar una lista ya traída de la base. */
export function esIngresoReal(pago: { paymentType: PaymentType | string }): boolean {
  return !TIPOS_QUE_NO_SON_INGRESO.includes(pago.paymentType as PaymentType);
}
