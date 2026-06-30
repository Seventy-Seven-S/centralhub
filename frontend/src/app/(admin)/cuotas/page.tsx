'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useCuotas, type Cuota } from '@/hooks/useCuotas';
import { useProjectSelection } from '@/contexts/ProjectContext';

const PAGE_SIZE  = 25;

// ── Helpers ───────────────────────────────────────────────────────────────────
function isVencida(cuota: Cuota): boolean {
  return (
    cuota.status === 'PENDIENTE' &&
    new Date(cuota.fechaVencimiento) < new Date()
  );
}

function resolvedStatus(cuota: Cuota): 'PAGADA' | 'VENCIDA' | 'PENDIENTE' {
  if (cuota.status === 'PAGADA') return 'PAGADA';
  if (isVencida(cuota))         return 'VENCIDA';
  return 'PENDIENTE';
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  PAGADA:    { bg: 'var(--accent-pale)',  color: 'var(--accent)',  label: 'Pagada' },
  PENDIENTE: { bg: 'var(--gold-pale)',    color: 'var(--gold)',    label: 'Pendiente' },
  VENCIDA:   { bg: 'var(--danger-pale)', color: 'var(--danger)',  label: 'Vencida' },
};

function StatusBadge({ cuota }: { cuota: Cuota }) {
  const s = STATUS_CONFIG[resolvedStatus(cuota)];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="p-5 space-y-2 animate-pulse">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="h-10 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }} />
      ))}
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl shadow-sm p-5" style={{ backgroundColor: 'var(--surface)' }}>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{value.toLocaleString('es-MX')}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CuotasPage() {
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<'' | 'PENDIENTE' | 'PAGADA' | 'MORA'>('');
  const [search,       setSearch]       = useState('');
  const [page,         setPage]         = useState(1);

  const { selectedProjectId } = useProjectSelection();
  const { data: cuotas = [], isLoading, isError } = useCuotas(selectedProjectId ?? undefined, statusFilter || undefined);

  const kpiPendientes = useMemo(() => cuotas.filter(c => c.status === 'PENDIENTE').length, [cuotas]);
  const kpiPagadas    = useMemo(() => cuotas.filter(c => c.status === 'PAGADA').length, [cuotas]);
  const kpiVencidas   = useMemo(() => cuotas.filter(isVencida).length, [cuotas]);

  const filtered = useMemo(() => {
    let list = cuotas;

    if (statusFilter === 'MORA') {
      list = list.filter(isVencida);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c =>
        `${c.contract.client.firstName} ${c.contract.client.lastName}`.toLowerCase().includes(q) ||
        (c.contract.codigoLegado ?? '').toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) =>
      new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime()
    );
  }, [cuotas, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleFilterChange(val: typeof statusFilter) {
    setStatusFilter(val);
    setPage(1);
  }

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Cuotas</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {isLoading ? 'Cargando…' : `${filtered.length} cuota${filtered.length !== 1 ? 's' : ''} encontrada${filtered.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Pendientes" value={kpiPendientes} color="var(--text-primary)" />
        <KpiCard label="Pagadas"    value={kpiPagadas}    color="var(--accent)" />
        <KpiCard label="Vencidas"   value={kpiVencidas}   color="var(--danger)" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Buscar por cliente o contrato…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-yellow-400"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
        />
        <select
          value={statusFilter}
          onChange={e => handleFilterChange(e.target.value as typeof statusFilter)}
          className="rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-yellow-400"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
        >
          <option value="">Todos los status</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="PAGADA">Pagada</option>
          <option value="MORA">En mora (vencidas)</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No se pudieron cargar las cuotas</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <FileText className="w-12 h-12" style={{ color: 'var(--bg-tertiary)' }} />
            <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No hay cuotas con estos filtros</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                    <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>#</th>
                    <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Mes</th>
                    <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Cliente</th>
                    <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Contrato</th>
                    <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Vencimiento</th>
                    <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Esperado</th>
                    <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Pagado</th>
                    <th className="text-center px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/contratos/${c.contract.id}`)}
                      className="cursor-pointer transition-colors hover:bg-[var(--bg-secondary)]"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      <td className="px-5 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.numeroCuota}</td>
                      <td className="px-5 py-3" style={{ color: 'var(--text-primary)' }}>{c.mes}</td>
                      <td className="px-5 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                        {c.contract.client.firstName} {c.contract.client.lastName}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {c.contract.codigoLegado ?? c.contract.id.slice(0, 8)}
                      </td>
                      <td className="px-5 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(c.fechaVencimiento).toLocaleDateString('es-MX', {
                          day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
                        })}
                      </td>
                      <td className="px-5 py-3 text-right" style={{ color: 'var(--text-primary)' }}>
                        {formatCurrency(c.montoEsperado)}
                      </td>
                      <td className="px-5 py-3 text-right font-medium"
                          style={{ color: c.montoPagado > 0 ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                        {c.montoPagado > 0 ? formatCurrency(c.montoPagado) : '—'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <StatusBadge cuota={c} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 text-sm" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <span>Página {page} de {totalPages}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-secondary)' }}
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-secondary)' }}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
