'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users, ChevronLeft, ChevronRight, Eye, AlertCircle } from 'lucide-react';
import { useClientes, useClientes as useClientesHook } from '@/hooks/useClientes';
import { useContratosByCliente } from '@/hooks/useClientes';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

const PAGE_SIZE = 20;

// ── Contrato count por cliente (batch) ────────────────────────────────────────
function useContratoCounts(clientIds: string[]) {
  return useQuery({
    queryKey: ['contrato-counts', clientIds.join(',')],
    queryFn:  async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        clientIds.map(async (id) => {
          const { data } = await api.get('/contracts', { params: { clientId: id } });
          counts[id] = data.count ?? 0;
        })
      );
      return counts;
    },
    enabled: clientIds.length > 0,
    staleTime: 120_000,
  });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
      </div>
      <table className="w-full">
        <tbody>
          {[...Array(8)].map((_, i) => (
            <tr key={i} className="border-b border-gray-50">
              {[...Array(5)].map((_, j) => (
                <td key={j} className="px-5 py-4">
                  <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + (j * 10) % 30}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useMemo(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ClientesPage() {
  const router = useRouter();
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const [sortBy,  setSortBy]  = useState('reciente');
  const debouncedSearch       = useDebounce(search, 300);

  const { data: clientes = [], isLoading, isError } = useClientes();

  // Filtrado + ordenamiento client-side
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const list = q
      ? clientes.filter(c =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.globalCode?.toLowerCase().includes(q)
        )
      : [...clientes];

    if (sortBy === 'az')      list.sort((a, b) => a.firstName.localeCompare(b.firstName));
    if (sortBy === 'za')      list.sort((a, b) => b.firstName.localeCompare(a.firstName));
    if (sortBy === 'cod-asc') list.sort((a, b) => (a.globalCode ?? '').localeCompare(b.globalCode ?? '', undefined, { numeric: true }));
    if (sortBy === 'cod-desc') list.sort((a, b) => (b.globalCode ?? '').localeCompare(a.globalCode ?? '', undefined, { numeric: true }));

    return list;
  }, [clientes, debouncedSearch, sortBy]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const clientIds  = paginated.map(c => c.id);

  const { data: contratoCounts = {} } = useContratoCounts(clientIds);

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
  }

  if (isLoading) return <TableSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-gray-600 font-medium">No se pudieron cargar los clientes</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header + búsqueda */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Clientes</h2>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} clientes encontrados</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, email o teléfono..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm text-gray-900 border border-gray-200 rounded-xl bg-white shadow-sm outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition"
            />
          </div>
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value); setPage(1); }}
            className="px-3 py-2.5 text-sm text-gray-700 border border-gray-200 rounded-xl bg-white shadow-sm outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition cursor-pointer"
          >
            <option value="reciente">Más reciente</option>
            <option value="az">A → Z</option>
            <option value="za">Z → A</option>
            <option value="cod-asc">Código ↑</option>
            <option value="cod-desc">Código ↓</option>
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Users className="w-10 h-10 text-gray-300" />
            <p className="text-gray-500 font-medium">No se encontraron clientes</p>
            <p className="text-sm text-gray-400">Intenta con otro término de búsqueda</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Nombre</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Email</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Teléfono</th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap"># Contratos</th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map(cliente => {
                  const fullName = `${cliente.firstName} ${cliente.lastName}`;
                  const initials = `${cliente.firstName[0] ?? ''}${cliente.lastName[0] ?? ''}`.toUpperCase();
                  const numContratos = contratoCounts[cliente.id] ?? '—';

                  return (
                    <tr
                      key={cliente.id}
                      onClick={() => router.push(`/clientes/${cliente.id}`)}
                      className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                    >
                      {/* Nombre */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                               style={{ backgroundColor: '#0F1F3D' }}>
                            {initials}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{fullName}</p>
                            <p className="text-xs text-gray-400">{cliente.globalCode}</p>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-5 py-3.5 text-gray-600 max-w-[200px] truncate">
                        {cliente.email || <span className="text-gray-300">—</span>}
                      </td>

                      {/* Teléfono */}
                      <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">
                        {cliente.phone || <span className="text-gray-300">—</span>}
                      </td>

                      {/* # Contratos */}
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full text-xs font-bold"
                              style={{ backgroundColor: '#F0F4FF', color: '#0F1F3D' }}>
                          {numContratos}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td className="px-5 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => router.push(`/clientes/${cliente.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-80"
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
