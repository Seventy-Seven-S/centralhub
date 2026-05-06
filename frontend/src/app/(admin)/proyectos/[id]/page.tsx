'use client';

import { use, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, FileText, LayoutGrid, TrendingUp, AlertCircle, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useProyectoById } from '@/hooks/useProyectos';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';

const PAGE_SIZE = 20;

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface ContratoRow {
  id:            string;
  codigoLegado:  string | null;
  status:        string;
  totalPrice:    number;
  balance:       number | null;
  moraMonthsCount: number;
  client: { firstName: string; lastName: string };
  lots:  Array<{ lot: { lotNumber: string; manzana: number } }>;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useContratosByProject(projectId: string) {
  return useQuery<ContratoRow[]>({
    queryKey: ['contratos', 'proyecto', projectId],
    queryFn:  async () => {
      const { data } = await api.get('/contracts', { params: { projectId } });
      return data.data;
    },
    enabled:   !!projectId,
    staleTime: 60_000,
  });
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  ACTIVE:   { bg: '#F0F9F4', color: '#166534', label: 'Activo' },
  IN_MORA:  { bg: '#FFF7ED', color: '#9A3412', label: 'En mora' },
  CLOSED:   { bg: '#F3F4F6', color: '#374151', label: 'Cerrado' },
  CANCELED: { bg: '#FEF2F2', color: '#991B1B', label: 'Cancelado' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { bg: '#F3F4F6', color: '#374151', label: status };
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 bg-gray-200 rounded-xl" />
        <div className="space-y-1.5">
          <div className="h-6 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-32 bg-gray-100 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl shadow-sm" />)}
      </div>
      <div className="h-20 bg-white rounded-2xl shadow-sm" />
      <div className="h-64 bg-white rounded-2xl shadow-sm" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProyectoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();
  const [page,   setPage]   = useState(1);
  const [sortBy, setSortBy] = useState('reciente');

  const { data: proyecto, isLoading: loadingProyecto, isError } = useProyectoById(id);
  const { data: contratos = [], isLoading: loadingContratos }   = useContratosByProject(id);

  const sorted = useMemo(() => {
    const list = [...contratos];
    if (sortBy === 'az')       list.sort((a, b) => a.client.firstName.localeCompare(b.client.firstName));
    if (sortBy === 'za')       list.sort((a, b) => b.client.firstName.localeCompare(a.client.firstName));
    if (sortBy === 'cod-asc')  list.sort((a, b) => (a.codigoLegado ?? '').localeCompare(b.codigoLegado ?? '', undefined, { numeric: true }));
    if (sortBy === 'cod-desc') list.sort((a, b) => (b.codigoLegado ?? '').localeCompare(a.codigoLegado ?? '', undefined, { numeric: true }));
    return list;
  }, [contratos, sortBy]);

  const totalReal  = proyecto ? proyecto.lotesVendidos + proyecto.lotesDisponibles : 0;
  const pct        = totalReal > 0 ? Math.min(100, Math.round(((proyecto?.lotesVendidos ?? 0) / totalReal) * 100)) : 0;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loadingProyecto) return <PageSkeleton />;

  if (isError || !proyecto) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle className="w-10 h-10 text-red-400" />
      <p className="text-gray-600 font-medium">No se pudo cargar el proyecto</p>
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── SECCIÓN 1: Header ── */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push('/proyectos')}
          className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">{proyecto.name}</h2>
            <span className="text-sm font-mono text-gray-400">{proyecto.code}</span>
            <StatusBadge status={proyecto.status} />
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
            <MapPin className="w-3.5 h-3.5" />
            <span>{proyecto.city}, {proyecto.state}</span>
          </div>
        </div>
      </div>

      {/* ── SECCIÓN 2: KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total contratos',   value: proyecto.totalContratos,              icon: <FileText className="w-5 h-5" />,   color: '#0F1F3D' },
          { label: 'Lotes disponibles', value: proyecto.lotesDisponibles,            icon: <LayoutGrid className="w-5 h-5" />, color: '#0F1F3D' },
          { label: 'Lotes vendidos',    value: proyecto.lotesVendidos,               icon: <LayoutGrid className="w-5 h-5" />, color: '#C9972C' },
          { label: 'Ingresos totales',  value: formatCurrency(proyecto.totalIngresos), icon: <TrendingUp className="w-5 h-5" />, color: '#166534', wide: true },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${color}18` }}>
              <span style={{ color }}>{icon}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 leading-tight">{label}</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5 truncate">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── SECCIÓN 3: Barra de progreso ── */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Progreso de ventas</p>
          <span className="text-sm font-bold" style={{ color: pct >= 75 ? '#16a34a' : '#C9972C' }}>{pct}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: pct >= 75 ? '#16a34a' : '#C9972C' }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{proyecto.lotesVendidos} vendidos</span>
          <span>{proyecto.lotesDisponibles} disponibles · {totalReal} totales en sistema</span>
        </div>
      </div>

      {/* ── SECCIÓN 4: Contratos ── */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Contratos del proyecto</h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{contratos.length} contratos</span>
            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setPage(1); }}
              className="px-3 py-1.5 text-sm text-gray-700 border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition cursor-pointer"
            >
              <option value="reciente">Más reciente</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
              <option value="cod-asc">Código ↑</option>
              <option value="cod-desc">Código ↓</option>
            </select>
          </div>
        </div>

        {loadingContratos ? (
          <div className="divide-y divide-gray-50">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex gap-4 animate-pulse">
                <div className="h-4 w-16 bg-gray-100 rounded" />
                <div className="h-4 flex-1 bg-gray-100 rounded" />
                <div className="h-4 w-20 bg-gray-100 rounded" />
                <div className="h-4 w-24 bg-gray-100 rounded" />
                <div className="h-4 w-16 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : contratos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="w-10 h-10 text-gray-300" />
            <p className="text-gray-500 font-medium">Sin contratos registrados</p>
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
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Saldo</th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Status</th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map(c => {
                  const lot      = c.lots?.[0]?.lot;
                  const loteLabel = lot ? `M${lot.manzana} L-${lot.lotNumber}` : '—';
                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/contratos/${c.id}`)}
                      className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-600">{c.codigoLegado ?? '—'}</td>
                      <td className="px-5 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                        {c.client.firstName} {c.client.lastName}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">{loteLabel}</td>
                      <td className="px-5 py-3.5 text-right text-gray-700 whitespace-nowrap">{formatCurrency(c.totalPrice)}</td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap font-medium"
                          style={{ color: (c.balance ?? 0) > 0 ? '#9A3412' : '#166534' }}>
                        {formatCurrency(c.balance ?? 0)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-5 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => router.push(`/contratos/${c.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-80 transition-opacity"
                          style={{ backgroundColor: '#C9972C' }}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Página {page} de {totalPages} · {contratos.length} contratos
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
