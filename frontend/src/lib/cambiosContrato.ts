// Cómo se le enseña al usuario un cambio de la bitácora.
//
// La bitácora guarda nombres de campo del schema ("installmentAmount") y
// valores en texto plano. Nadie en la inmobiliaria habla así.

const NOMBRES: Record<string, string> = {
  totalPrice: 'Precio total',
  installmentAmount: 'Mensualidad',
  installmentCount: 'Plazo',
  startDate: 'Inicio del calendario',
  lotIds: 'Manzana y lote',
  balance: 'Saldo',
  moraMonthsCount: 'Meses en mora',
};

/** Campos cuyo valor es dinero y debe verse con signo de pesos. */
const EN_PESOS = new Set(['totalPrice', 'installmentAmount', 'balance']);

export function nombreDeCampo(campo: string): string {
  return NOMBRES[campo] ?? campo;
}

export function valorLegible(campo: string, valor: string | null): string {
  if (valor === null || valor === '') return '—';
  if (EN_PESOS.has(campo)) {
    const n = Number(valor);
    if (Number.isFinite(n)) return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (campo === 'installmentCount') return `${valor} meses`;
  return valor;
}
