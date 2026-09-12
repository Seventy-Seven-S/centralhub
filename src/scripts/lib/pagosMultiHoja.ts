/**
 * Lector de los archivos del sistema viejo que guardan un corte por hoja
 * (JSA 1-4.xlsx, con 60-100 hojas cada uno).
 *
 * Ahí las columnas se mueven de hoja en hoja y cada una mezcla los pagos con
 * renglones de resumen ("Total Entregado", "Remanente Septiembre", firmas). En
 * vez de fijar posiciones, un renglón se reconoce como pago por su FORMA: trae
 * una fecha, un código de cliente y un monto.
 */
export interface PagoFila {
  cod: string;
  fecha: Date;
  monto: number;
  tipo: string;
  concepto: string;
}

/** Código de cliente: una letra y tres dígitos (B012, A071, V463). */
const RE_CODIGO = /^[A-Z]\d{3}$/;
const esSerial = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 40000 && v < 60000;

export const fechaDeSerial = (s: number) =>
  new Date(Date.UTC(1899, 11, 30) + Math.round(s * 86400000));

export function extraerPagosDeFila(fila: unknown[]): PagoFila | null {
  let cod = '', fecha: Date | null = null, monto: number | null = null;
  const textos: string[] = [];

  for (const celda of fila) {
    if (typeof celda === 'string') {
      const s = celda.trim().toUpperCase();
      if (!cod && RE_CODIGO.test(s)) { cod = s; continue; }
      if (celda.trim()) textos.push(celda.trim());
      continue;
    }
    if (esSerial(celda)) { if (!fecha) fecha = fechaDeSerial(celda); continue; }
    // Cualquier otro número es candidato a monto; se queda el último, porque
    // la fecha ya se consumió arriba y los montos van al final del renglón.
    if (typeof celda === 'number' && Number.isFinite(celda)) monto = celda;
  }

  if (!cod || !fecha || monto === null || monto === 0) return null;
  return {
    cod, fecha, monto,
    tipo: textos[0] ?? '',
    concepto: textos[1] ?? textos[0] ?? '',
  };
}
