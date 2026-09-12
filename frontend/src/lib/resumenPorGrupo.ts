/**
 * Resumen genérico "cuántos y cuánto" por grupo, ordenado de mayor a menor
 * monto. Lo usan las pantallas de Ingresos (por tipo de pago) y de Gastos
 * (por categoría) para mostrar el desglose completo junto al filtro.
 */
export interface ResumenGrupo {
  clave: string;
  etiqueta: string;
  cantidad: number;
  monto: number;
}

export function resumirPorGrupo<T>(
  items: T[],
  clave: (item: T) => string,
  etiqueta: (item: T) => string,
  monto: (item: T) => number,
): ResumenGrupo[] {
  const acc = new Map<string, ResumenGrupo>();
  for (const item of items) {
    const k = clave(item);
    const r = acc.get(k) ?? { clave: k, etiqueta: etiqueta(item), cantidad: 0, monto: 0 };
    r.cantidad += 1;
    r.monto += monto(item);
    acc.set(k, r);
  }
  return [...acc.values()].sort((a, b) => b.monto - a.monto);
}
