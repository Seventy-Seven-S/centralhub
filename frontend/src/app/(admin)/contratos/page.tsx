'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, FileText, AlertTriangle, DollarSign,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useContratos, ContratoDetalle } from '@/hooks/useContratos';
import KPICard           from '@/components/dashboard/KPICard';
import { formatCurrency } from '@/lib/utils';

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
      <div className="h-7 w-40 bg-gray-200 rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-gray-200 rounded-2xl" />)}
      </div>
      <div className="flex gap-3">
        <div className="h-10 flex-1 bg-gray-200 rounded-xl" />
        <div className="h-10 w-32 bg-gray-200 rounded-xl" />
        <div className="h-10 w-32 bg-gray-200 rounded-xl" />
      </div>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <tbody>
            {[...Array(10)].map((_, i) => (
              <tr key={i} className="border-b border-gray-50">
                {[...Array(8)].map((_, j) => (
                  <td key={j} className="px-5 py-4">
                    <div className="h-4 bg-gray-100 rounded" style={{ width: `${50 + (j * 7) % 40}%` }} />
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

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'ACTIVE';
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{
        backgroundColor: isActive ? '#DCFCE7' : '#FEE2E2',
        color:           isActive ? '#15803D' : '#B91C1C',
      }}
    >
      {isActive ? 'Activo' : 'En mora'}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContratosPage() {
  const router = useRouter();
  const [search,     setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [sortBy,     setSortBy]     = useState('reciente');
  const [page,       setPage]       = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const { data: contratos = [], isLoading, isError } = useContratos();

  // KPIs
  const kpis = useMemo(() => ({
    activos:        contratos.filter(c => c.status === 'ACTIVE').length,
    enMora:         contratos.filter(c => c.status === 'IN_MORA').length,
    conSaldo:       contratos.filter(c => (c.balance ?? 0) > 0).length,
  }), [contratos]);

  // Filtrado + ordenamiento
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

    let list = contratos.filter(c => {
      const matchSearch = !q ||
        `${c.client.firstName} ${c.client.lastName}`.toLowerCase().includes(q) ||
        (c.codigoLegado ?? '').toLowerCase().includes(q) ||
        c.contractNumber.toLowerCase().includes(q);

      const matchStatus =
        statusFilter === 'todos' ||
        (statusFilter === 'activo' && c.status === 'ACTIVE') ||
        (statusFilter === 'mora'   && c.status === 'IN_MORA');

      return matchSearch && matchStatus;
    });

    if (sortBy === 'az')        list = [...list].sort((a, b) => a.client.firstName.localeCompare(b.client.firstName));
    if (sortBy === 'za')        list = [...list].sort((a, b) => b.client.firstName.localeCompare(a.client.firstName));
    if (sortBy === 'cod-asc')   list = [...list].sort((a, b) => (a.codigoLegado ?? '').localeCompare(b.codigoLegado ?? '', undefined, { numeric: true }));
    if (sortBy === 'cod-desc')  list = [...list].sort((a, b) => (b.codigoLegado ?? '').localeCompare(a.codigoLegado ?? '', undefined, { numeric: true }));

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
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <p className="text-gray-600 font-medium">No se pudieron cargar los contratos</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Contratos</h2>
        <p className="text-sm text-gray-500 mt-0.5">{filtered.length} contratos encontrados</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          icon={FileText}
          title="Contratos activos"
          value={kpis.activos}
          subtitle="al corriente de pagos"
          accent="#22C55E"
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
          accent="#4A7CB5"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Buscador */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente o código de contrato..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm text-gray-900 border border-gray-200 rounded-xl bg-white shadow-sm outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition"
          />
        </div>

        {/* Filtro status */}
        <select
          value={statusFilter}
          onChange={e => handleStatus(e.target.value)}
          className="px-3 py-2.5 text-sm text-gray-700 border border-gray-200 rounded-xl bg-white shadow-sm outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition cursor-pointer"
        >
          <option value="todos">Todos los status</option>
          <option value="activo">Activo</option>
          <option value="mora">En mora</option>
        </select>

        {/* Ordenamiento */}
        <select
          value={sortBy}
          onChange={e => handleSort(e.target.value)}
          className="px-3 py-2.5 text-sm text-gray-700 border border-gray-200 rounded-xl bg-white shadow-sm outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition cursor-pointer"
        >
          <option value="reciente">Más reciente</option>
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="cod-asc">Código ↑</option>
          <option value="cod-desc">Código ↓</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="w-10 h-10 text-gray-300" />
            <p className="text-gray-500 font-medium">No se encontraron contratos</p>
            <p className="text-sm text-gray-400">Intenta con otro término de búsqueda o filtro</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Código</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Cliente</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Lote</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Precio total</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Balance</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Mensualidad</th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Mora</th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/contratos/${c.id}`)}
                    className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                  >
                    {/* Código */}
                    <td className="px-5 py-3.5">
                      <span className="font-mono font-semibold text-gray-800">
                        {c.codigoLegado ?? c.contractNumber}
                      </span>
                    </td>

                    {/* Cliente */}
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900 whitespace-nowrap">
                        {c.client.firstName} {c.client.lastName}
                      </p>
                    </td>

                    {/* Lote */}
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                      {lotLabel(c)}
                    </td>

                    {/* Precio total */}
                    <td className="px-5 py-3.5 text-right font-medium text-gray-800 whitespace-nowrap">
                      {formatCurrency(c.totalPrice)}
                    </td>

                    {/* Balance */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <span className={(c.balance ?? 0) > 0 ? 'text-gray-800 font-medium' : 'text-gray-400'}>
                        {formatCurrency(c.balance ?? 0)}
                      </span>
                    </td>

                    {/* Mensualidad */}
                    <td className="px-5 py-3.5 text-right text-gray-600 whitespace-nowrap">
                      {c.installmentAmount ? formatCurrency(c.installmentAmount) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Meses en mora */}
                    <td className="px-5 py-3.5 text-center">
                      {c.moraMonthsCount > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-bold bg-red-100 text-red-700">
                          {c.moraMonthsCount}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
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
          <p className="text-sm text-gray-500">
            Página {page} de {totalPages} · {filtered.length} resultados
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition"
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
