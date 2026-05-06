'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useCuotas, type Cuota } from '@/hooks/useCuotas';

const PROJECT_ID = '74b9deb6-a793-408d-8087-0e30ef0f288d';
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
  PAGADA:    { bg: '#F0F9F4', color: '#166534', label: 'Pagada' },
  PENDIENTE: { bg: '#F3F4F6', color: '#374151', label: 'Pendiente' },
  VENCIDA:   { bg: '#FEF2F2', color: '#991B1B', label: 'Vencida' },
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
        <div key={i} className="h-10 bg-gray-100 rounded-lg" />
      ))}
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <p className="text-xs text-gray-500">{label}</p>
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

  const { data: cuotas = [], isLoading, isError } = useCuotas(PROJECT_ID, statusFilter || undefined);

  // ── KPIs (always from full unfiltered data, but we already have it) ─────────
  const kpiPendientes = useMemo(() => cuotas.filter(c => c.status === 'PENDIENTE').length, [cuotas]);
  const kpiPagadas    = useMemo(() => cuotas.filter(c => c.status === 'PAGADA').length, [cuotas]);
  const kpiVencidas   = useMemo(() => cuotas.filter(isVencida).length, [cuotas]);

  // ── Client-side search + vencida filter ──────────────────────────────────
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
        <h1 className="text-2xl font-bold text-gray-900">Cuotas</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isLoading ? 'Cargando…' : `${filtered.length} cuota${filtered.length !== 1 ? 's' : ''} encontrada${filtered.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Pendientes"  value={kpiPendientes} color="#374151" />
        <KpiCard label="Pagadas"     value={kpiPagadas}    color="#166534" />
        <KpiCard label="Vencidas"    value={kpiVencidas}   color="#991B1B" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Buscar por cliente o contrato…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-yellow-400"
        />
        <select
          value={statusFilter}
          onChange={e => handleFilterChange(e.target.value as typeof statusFilter)}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-yellow-400"
        >
          <option value="">Todos los status</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="PAGADA">Pagada</option>
          <option value="MORA">En mora (vencidas)</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-gray-600 font-medium">No se pudieron cargar las cuotas</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <FileText className="w-12 h-12 text-gray-300" />
            <p className="text-gray-500 font-medium">No hay cuotas con estos filtros</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">#</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Mes</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Cliente</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Contrato</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Vencimiento</th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600">Esperado</th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600">Pagado</th>
                    <th className="text-center px-5 py-3 font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/contratos/${c.contract.id}`)}
                      className="hover:bg-gray-50/60 cursor-pointer"
                    >
                      <td className="px-5 py-3 text-gray-500 text-xs">{c.numeroCuota}</td>
                      <td className="px-5 py-3 text-gray-700">{c.mes}</td>
                      <td className="px-5 py-3 text-gray-700 whitespace-nowrap">
                        {c.contract.client.firstName} {c.contract.client.lastName}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-500">
                        {c.contract.codigoLegado ?? c.contract.id.slice(0, 8)}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(c.fechaVencimiento).toLocaleDateString('es-MX', {
                          day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
                        })}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-700">
                        {formatCurrency(c.montoEsperado)}
                      </td>
                      <td className="px-5 py-3 text-right font-medium"
                          style={{ color: c.montoPagado > 0 ? '#166534' : '#9CA3AF' }}>
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
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>Página {page} de {totalPages}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
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
