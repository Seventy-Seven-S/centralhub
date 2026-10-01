// Con qué tipo llega un pago cuando se traslada a otro contrato.
//
// El enganche y el depósito de apartado son del contrato donde se pactaron:
// el saldo se calcula como `precio − downPayment − lo pagado en cuotas`, así
// que un enganche que llega de fuera no cuenta en ninguna de las dos partes y
// el saldo del contrato que lo recibe sube por ese monto.
//
// Pasó de verdad: al trasladar los $71,500 del V369 al V254, el enganche de
// $40,000 que venía dentro hizo subir el saldo del V254 en $40,000. Lo que el
// negocio quiere en estos traslados es que el dinero cubra mensualidades.

type TipoDePago = 'DOWN_PAYMENT' | 'RESERVATION_DEPOSIT' | 'INSTALLMENT' | 'EXTRA_PAYMENT';

export function tipoAlTrasladar(tipoOriginal: TipoDePago): TipoDePago {
  return tipoOriginal === 'DOWN_PAYMENT' || tipoOriginal === 'RESERVATION_DEPOSIT'
    ? 'EXTRA_PAYMENT'
    : tipoOriginal;
}
