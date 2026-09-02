'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, FileText, AlertTriangle, DollarSign,
  ChevronLeft, ChevronRight, Plus,
} from 'lucide-react';
import { useContratos, ContratoDetalle } from '@/hooks/useContratos';
import { useProjectSelection } from '@/contexts/ProjectContext';
import KPICard           from '@/components/dashboard/KPICard';
import { formatCurrency, normalizeForSearch } from '@/lib/utils';

const PAGE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useMemo(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function lotLabel(c: ContratoDetalle): string {
  if (!c.lots?.length) return '—';
  return c.lots
    .map(l => `M${l.lot.manzana}-L${l.lot.lotNumber}`)
    .join(', ');
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-7 w-40 rounded-xl" style={{ backgroundColor: 'var(--border)' }} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-28 rounded-2xl" style={{ backgroundColor: 'var(--border)' }} />)}
      </div>
      <div className="flex gap-3">
        <div className="h-10 flex-1 rounded-xl" style={{ backgroundColor: 'var(--border)' }} />
        <div className="h-10 w-32 rounded-xl" style={{ backgroundColor: 'var(--border)' }} />
        <div className="h-10 w-32 rounded-xl" style={{ backgroundColor: 'var(--border)' }} />
      </div>
      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
        <table className="w-full">
          <tbody>
            {[...Array(10)].map((_, i) => (
              <tr key={i} className="border-b" style={{ borderColor: 'var(--border)' }}>
                {[...Array(8)].map((_, j) => (
                  <td key={j} className="px-5 py-4">
                    <div className="h-4 rounded" style={{ backgroundColor: 'var(--bg-secondary)', width: `${50 + (j * 7) % 40}%` }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  ACTIVE:     { label: 'Activo',     bg: 'var(--success-bg)',  color: 'var(--success)'        },
  IN_MORA:    { label: 'En mora',    bg: 'var(--danger-bg)',   color: 'var(--danger)'          },
  DRAFT:      { label: 'Borrador',   bg: 'var(--bg-secondary)', color: 'var(--text-secondary)' },
  SIGNED:     { label: 'Firmado',    bg: 'var(--accent-bg)',   color: 'var(--accent)'          },
  COMPLETED:  { label: 'Completado', bg: 'var(--success-bg)',  color: 'var(--success)'         },
  CANCELED:   { label: 'Cancelado',  bg: 'var(--bg-secondary)', color: 'var(--text-tertiary)'  },
  RESCISSION: { label: 'Rescisión',  bg: 'var(--danger-bg)',   color: 'var(--danger)'          },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, bg: 'var(--bg-secondary)', color: 'var(--text-secondary)' };
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContratosPage() {
  const router = useRouter();
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [sortBy,       setSortBy]       = useState('reciente');
  const [page,         setPage]         = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const { selectedProjectId } = useProjectSelection();
  const { data: contratos = [], isLoading, isError } = useContratos(selectedProjectId ?? undefined);

  useEffect(() => { setPage(1); }, [selectedProjectId]);

  // KPIs
  const kpis = useMemo(() => ({
    activos:  contratos.filter(c => c.status === 'ACTIVE').length,
    enMora:   contratos.filter(c => c.status === 'IN_MORA').length,
    conSaldo: contratos.filter(c => (c.balance ?? 0) > 0).length,
  }), [contratos]);

  // Filtrado + ordenamiento
  const filtered = useMemo(() => {
    const q = normalizeForSearch(debouncedSearch.trim());

    let list = contratos.filter(c => {
      const matchSearch = !q ||
        normalizeForSearch(`${c.client.firstName} ${c.client.lastName}`).includes(q) ||
        normalizeForSearch(c.codigoLegado ?? '').includes(q) ||
        normalizeForSearch(c.contractNumber).includes(q);

      const matchStatus =
        statusFilter === 'todos' ||
        (statusFilter === 'activo' && c.status === 'ACTIVE') ||
        (statusFilter === 'mora'   && c.status === 'IN_MORA');

      return matchSearch && matchStatus;
    });

    if (sortBy === 'az')       list = [...list].sort((a, b) => a.client.firstName.localeCompare(b.client.firstName));
    if (sortBy === 'za')       list = [...list].sort((a, b) => b.client.firstName.localeCompare(a.client.firstName));
    if (sortBy === 'cod-asc')  list = [...list].sort((a, b) => (a.codigoLegado ?? '').localeCompare(b.codigoLegado ?? '', undefined, { numeric: true }));
    if (sortBy === 'cod-desc') list = [...list].sort((a, b) => (b.codigoLegado ?? '').localeCompare(a.codigoLegado ?? '', undefined, { numeric: true }));

    return list;
  }, [contratos, debouncedSearch, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearch(val: string) { setSearch(val); setPage(1); }
  function handleStatus(val: string) { setStatusFilter(val); setPage(1); }
  function handleSort(val: string)   { setSortBy(val); setPage(1); }

  if (isLoading) return <PageSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="w-10 h-10" style={{ color: 'var(--danger)' }} />
        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No se pudieron cargar los contratos</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Contratos</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{filtered.length} contratos encontrados</p>
        </div>
        <button
          onClick={() => router.push('/nuevo-contrato')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ backgroundColor: 'var(--accent)', color: 'white' }}
        >
          <Plus size={16} />
          Nuevo contrato
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          icon={FileText}
          title="Contratos activos"
          value={kpis.activos}
          subtitle="al corriente de pagos"
          accent="var(--success)"
        />
        <KPICard
          icon={AlertTriangle}
          title="En mora"
          value={kpis.enMora}
          subtitle="con cuotas vencidas"
          alert={kpis.enMora > 0}
        />
        <KPICard
          icon={DollarSign}
          title="Con saldo pendiente"
          value={kpis.conSaldo}
          subtitle="balance > $0"
          accent="var(--accent)"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Buscador */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder="Buscar por cliente o código de contrato..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl shadow-sm outline-none transition"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Filtro status */}
        <select
          value={statusFilter}
          onChange={e => handleStatus(e.target.value)}
          className="px-3 py-2.5 text-sm border rounded-xl shadow-sm outline-none transition cursor-pointer"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <option value="todos">Todos los status</option>
          <option value="activo">Activo</option>
          <option value="mora">En mora</option>
        </select>

        {/* Ordenamiento */}
        <select
          value={sortBy}
          onChange={e => handleSort(e.target.value)}
          className="px-3 py-2.5 text-sm border rounded-xl shadow-sm outline-none transition cursor-pointer"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <option value="reciente">Más reciente</option>
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="cod-asc">Código ↑</option>
          <option value="cod-desc">Código ↓</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }} />
            <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No se encontraron contratos</p>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Intenta con otro término de búsqueda o filtro</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                  <th className="text-left px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Código</th>
                  <th className="text-left px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Cliente</th>
                  <th className="text-left px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Lote</th>
                  <th className="text-right px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Precio total</th>
                  <th className="text-right px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Balance</th>
                  <th className="text-right px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Mensualidad</th>
                  <th className="text-center px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Mora</th>
                  <th className="text-center px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginated.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/contratos/${c.id}`)}
                    className="cursor-pointer transition-colors"
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Código */}
                    <td className="px-5 py-3.5">
                      <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {c.codigoLegado ?? c.contractNumber}
                      </span>
                    </td>

                    {/* Cliente */}
                    <td className="px-5 py-3.5">
                      <p className="font-medium whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                        {c.client.firstName} {c.client.lastName}
                      </p>
                    </td>

                    {/* Lote */}
                    <td className="px-5 py-3.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {lotLabel(c)}
                    </td>

                    {/* Precio total */}
                    <td className="px-5 py-3.5 text-right font-medium whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(c.totalPrice)}
                    </td>

                    {/* Balance */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <span style={{ color: (c.balance ?? 0) > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: (c.balance ?? 0) > 0 ? 600 : 400 }}>
                        {formatCurrency(c.balance ?? 0)}
                      </span>
                    </td>

                    {/* Mensualidad */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {c.installmentAmount ? formatCurrency(c.installmentAmount) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>

                    {/* Meses en mora */}
                    <td className="px-5 py-3.5 text-center">
                      {c.moraMonthsCount > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-bold" style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }}>
                          {c.moraMonthsCount}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5 text-center">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Página {page} de {totalPages} · {filtered.length} resultados
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--surface)')}
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--surface)')}
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
