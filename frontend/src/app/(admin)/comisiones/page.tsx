'use client';

import { useMemo, useState } from 'react';
import { DollarSign, CheckCircle2, Loader2 } from 'lucide-react';
import {
  useComisiones, usePagarComision,
  Commission, CommissionStatus, CommissionFilters,
} from '@/hooks/useComisiones';
import { formatCurrency } from '@/lib/utils';

// ── Status badge config ─────────────────────────────────────────────────────

const STATUS_META: Record<CommissionStatus, { label: string; bg: string; color: string }> = {
  PENDING:  { label: 'Pendiente', bg: 'rgba(234, 179, 8, 0.12)',  color: '#a16207' },
  APPROVED: { label: 'Aprobada',  bg: 'rgba(59, 130, 246, 0.12)', color: '#1d4ed8' },
  PAID:     { label: 'Pagada',    bg: 'rgba(34, 197, 94, 0.12)',  color: '#15803d' },
  CANCELED: { label: 'Cancelada', bg: 'rgba(107, 114, 128, 0.14)', color: '#4b5563' },
};

function StatusBadge({ status }: { status: CommissionStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.PENDING;
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

function agentName(c: Commission): string {
  if (!c.agent) return '—';
  return `${c.agent.firstName} ${c.agent.lastName}`.trim();
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="p-5 space-y-2 animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-11 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }} />
      ))}
    </div>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl p-5 shadow-sm" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: CommissionStatus[] = ['PENDING', 'APPROVED', 'PAID', 'CANCELED'];

export default function ComisionesPage() {
  const [statusFilter, setStatusFilter] = useState<'' | CommissionStatus>('');
  const [payingId, setPayingId] = useState<string | null>(null);

  const filters: CommissionFilters = {
    status: statusFilter || undefined,
  };

  const { data: commissions = [], isLoading } = useComisiones(filters);
  const pagarMutation = usePagarComision();

  const totals = useMemo(() => {
    const all = commissions.reduce((s, c) => s + (c.commissionAmount ?? 0), 0);
    const pending = commissions
      .filter(c => c.status === 'PENDING' || c.status === 'APPROVED')
      .reduce((s, c) => s + (c.commissionAmount ?? 0), 0);
    const paid = commissions
      .filter(c => c.status === 'PAID')
      .reduce((s, c) => s + (c.commissionAmount ?? 0), 0);
    return { all, pending, paid };
  }, [commissions]);

  async function handlePay(id: string) {
    setPayingId(id);
    try {
      await pagarMutation.mutateAsync(id);
    } catch {
      /* error mostrado por estado de la mutación */
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Comisiones</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Seguimiento de comisiones por venta</p>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Total comisiones" value={formatCurrency(totals.all)} sub={`${commissions.length} registro${commissions.length !== 1 ? 's' : ''}`} />
        <KpiCard label="Por pagar" value={formatCurrency(totals.pending)} sub="Pendientes y aprobadas" />
        <KpiCard label="Pagadas" value={formatCurrency(totals.paid)} />
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as '' | CommissionStatus)}
          className="px-3 py-2.5 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 transition cursor-pointer"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="">Todos los estados</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
      </div>

      {/* ── Tabla ── */}
      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
        {isLoading ? (
          <TableSkeleton />
        ) : commissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <DollarSign className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }} />
            <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No hay comisiones para mostrar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                  <th className="text-left px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Agente</th>
                  <th className="text-left px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Contrato</th>
                  <th className="text-right px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Base</th>
                  <th className="text-right px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>%</th>
                  <th className="text-right px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Monto</th>
                  <th className="text-center px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Estado</th>
                  <th className="text-center px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map(c => (
                  <tr
                    key={c.id}
                    className="transition-colors hover:bg-[var(--bg-secondary)]"
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <td className="px-5 py-3.5 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{agentName(c)}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{c.contract?.contractNumber ?? '—'}</td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(c.baseAmount)}</td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {c.percentage != null ? `${c.percentage}%` : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{formatCurrency(c.commissionAmount)}</td>
                    <td className="px-5 py-3.5 text-center"><StatusBadge status={c.status} /></td>
                    <td className="px-5 py-3.5 text-center">
                      {c.status === 'PAID' ? (
                        <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          <CheckCircle2 className="w-4 h-4" /> Pagada
                        </span>
                      ) : c.status === 'CANCELED' ? (
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>—</span>
                      ) : (
                        <button
                          onClick={() => handlePay(c.id)}
                          disabled={payingId === c.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: 'var(--accent)' }}
                        >
                          {payingId === c.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Marcar pagada
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
