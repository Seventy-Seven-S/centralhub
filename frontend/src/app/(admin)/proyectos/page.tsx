'use client';

import { useRouter } from 'next/navigation';
import { Building2, MapPin, TrendingUp, AlertCircle } from 'lucide-react';
import { useProyectos, Proyecto } from '@/hooks/useProyectos';
import { formatCurrency } from '@/lib/utils';

// ── Skeleton ──────────────────────────────────────────────────────────────────
function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl shadow-sm p-5 space-y-3 animate-pulse">
          <div className="flex justify-between">
            <div className="h-5 w-32 bg-gray-200 rounded" />
            <div className="h-5 w-14 bg-gray-100 rounded-full" />
          </div>
          <div className="h-4 w-24 bg-gray-100 rounded" />
          <div className="grid grid-cols-3 gap-2 pt-2">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="h-14 bg-gray-100 rounded-xl" />
            ))}
          </div>
          <div className="h-2 bg-gray-100 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function ProyectoCard({ proyecto, onClick }: { proyecto: Proyecto; onClick: () => void }) {
  const totalReal = proyecto.lotesVendidos + proyecto.lotesDisponibles;
  const pct       = totalReal > 0 ? Math.min(100, Math.round((proyecto.lotesVendidos / totalReal) * 100)) : 0;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer p-5 space-y-4 border border-transparent hover:border-yellow-300"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-gray-900 text-base leading-tight">{proyecto.name}</h3>
          <span className="text-xs font-mono text-gray-400 mt-0.5 block">{proyecto.code}</span>
        </div>
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold shrink-0"
          style={{ backgroundColor: '#F0F9F4', color: '#166534' }}
        >
          {proyecto.status === 'ACTIVE' ? 'Activo' : proyecto.status}
        </span>
      </div>

      {/* Ubicación */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <MapPin className="w-3.5 h-3.5 shrink-0" />
        <span>{proyecto.city}, {proyecto.state}</span>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-gray-900">{proyecto.totalContratos}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-tight">Contratos</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-gray-900">{proyecto.lotesDisponibles}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-tight">Disponibles</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold" style={{ color: '#C9972C' }}>{proyecto.lotesVendidos}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-tight">Vendidos</p>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Progreso de ventas</span>
          <span className="font-medium text-gray-700">{pct}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: pct >= 75 ? '#16a34a' : '#C9972C' }}
          />
        </div>
        <p className="text-xs text-gray-400">{totalReal} lotes totales</p>
      </div>

      {/* Ingresos */}
      {proyecto.totalIngresos > 0 && (
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
          <TrendingUp className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs text-gray-500">Ingresos:</span>
          <span className="text-xs font-semibold text-gray-800">{formatCurrency(proyecto.totalIngresos)}</span>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProyectosPage() {
  const router = useRouter();
  const { data: proyectos = [], isLoading, isError } = useProyectos();

  if (isLoading) return (
    <div className="space-y-4">
      <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
      <GridSkeleton />
    </div>
  );

  if (isError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle className="w-10 h-10 text-red-400" />
      <p className="text-gray-600 font-medium">No se pudieron cargar los proyectos</p>
    </div>
  );

  const activos = proyectos.filter(p => p.status === 'ACTIVE').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Proyectos</h2>
          <p className="text-sm text-gray-500 mt-0.5">{activos} proyectos activos</p>
        </div>
      </div>

      {proyectos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Building2 className="w-10 h-10 text-gray-300" />
          <p className="text-gray-500 font-medium">No hay proyectos registrados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {proyectos.map(p => (
            <ProyectoCard
              key={p.id}
              proyecto={p}
              onClick={() => router.push(`/proyectos/${p.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
