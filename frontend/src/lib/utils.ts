import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

// Tiempo relativo simple en español: "hace 5 min", "hace 2 h", "hace 3 d".
export function formatRelativeTime(date: string | Date): string {
  const then = new Date(date).getTime();
  const diffSec = Math.floor((Date.now() - then) / 1000);

  if (!Number.isFinite(diffSec) || diffSec < 0) return 'ahora';
  if (diffSec < 60) return 'hace un momento';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr} h`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `hace ${diffDay} d`;

  return formatDate(date);
}

/**
 * Etiqueta con TODOS los lotes de un contrato, agrupados por manzana.
 *   [M9-L9, M9-L10]        → "M9 L-9, L-10"
 *   [M9-L9, M10-L3]        → "M9 L-9 · M10 L-3"
 *   [] / undefined         → "—"
 */
export function formatLotsLabel(
  lots?: Array<{ lot: { manzana: number; lotNumber: string } }>,
): string {
  if (!lots || lots.length === 0) return '—';
  const byManzana = new Map<number, string[]>();
  for (const { lot } of lots) {
    if (!byManzana.has(lot.manzana)) byManzana.set(lot.manzana, []);
    byManzana.get(lot.manzana)!.push(lot.lotNumber);
  }
  return [...byManzana.entries()]
    .sort(([a], [b]) => a - b)
    .map(([m, nums]) => `M${m} ${nums.map(n => `L-${n}`).join(', ')}`)
    .join(' · ');
}

/**
 * Fecha de HOY en horario local como YYYY-MM-DD (para inputs type="date").
 * NO usar toISOString(): devuelve la fecha en UTC y en México (UTC-6) después
 * de las 6pm pre-llena la fecha de MAÑANA en los formularios de pago/gasto.
 */
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
