'use client';

import { formatCurrency } from '@/lib/utils';

/**
 * Resumen y filtro en un solo control: cada chip dice cuántos registros de ese
 * grupo hay y cuánto suman, y al tocarlo filtra la tabla. Lo usan Ingresos (por
 * tipo de pago) y Gastos (por categoría).
 */
export default function ChipResumen({ activo, onClick, etiqueta, cantidad, monto }: {
  activo: boolean;
  onClick: () => void;
  etiqueta: string;
  cantidad: number;
  monto: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className="rounded-xl px-3.5 py-2 text-left transition-colors"
      style={{
        border: `1px solid ${activo ? 'var(--accent)' : 'var(--border)'}`,
        backgroundColor: activo ? 'var(--accent)' : 'var(--surface)',
      }}
    >
      <span className="block text-xs font-semibold" style={{ color: activo ? '#fff' : 'var(--text-primary)' }}>
        {etiqueta}
      </span>
      <span className="block text-xs mt-0.5" style={{ color: activo ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)' }}>
        {cantidad} · {formatCurrency(monto)}
      </span>
    </button>
  );
}
