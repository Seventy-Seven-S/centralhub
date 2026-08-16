// Siguiente número de pago de un proyecto a partir del ÚLTIMO existente
// (máximo lexicográfico con padding de 6). Sustituye al viejo count()+1
// global, que colisionaba tras borrados o registros concurrentes porque
// paymentNumber es unique global — misma clase de bug que el generador de
// códigos de contrato (ver contractCode.ts).
export function nextPaymentNumber(lastPaymentNumber: string | null, prefix: string): string {
  const lastSuffix = lastPaymentNumber?.startsWith(prefix)
    ? parseInt(lastPaymentNumber.slice(prefix.length), 10)
    : NaN;
  const next = Number.isNaN(lastSuffix) ? 1 : lastSuffix + 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
}
