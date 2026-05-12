'use client';

import { useRouter } from 'next/navigation';
import { Building2, MapPin, TrendingUp, AlertCircle } from 'lucide-react';
import { useProyectos, Proyecto } from '@/hooks/useProyectos';
import { useRole } from '@/hooks/useRole';
import { formatCurrency } from '@/lib/utils';

// ── Skeleton ──────────────────────────────────────────────────────────────────
function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="rounded-2xl shadow-sm p-5 space-y-3 animate-pulse" style={{ backgroundColor: 'var(--surface)' }}>
          <div className="flex justify-between">
            <div className="h-5 w-32 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
            <div className="h-5 w-14 rounded-full" style={{ backgroundColor: 'var(--bg-secondary)' }} />
          </div>
          <div className="h-4 w-24 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }} />
          <div className="grid grid-cols-3 gap-2 pt-2">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="h-14 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />
            ))}
          </div>
          <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--bg-secondary)' }} />
        </div>
      ))}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function ProyectoCard({ proyecto, onClick, hideIngresos }: { proyecto: Proyecto; onClick: () => void; hideIngresos: boolean }) {
  const totalReal = proyecto.lotesVendidos + proyecto.lotesDisponibles;
  const pct       = totalReal > 0 ? Math.min(100, Math.round((proyecto.lotesVendidos / totalReal) * 100)) : 0;

  return (
    <div
      onClick={onClick}
      className="rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer p-5 space-y-4"
      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-base leading-tight" style={{ color: 'var(--text-primary)' }}>{proyecto.name}</h3>
          <span className="text-xs font-mono mt-0.5 block" style={{ color: 'var(--text-tertiary)' }}>{proyecto.code}</span>
        </div>
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold shrink-0"
          style={{ backgroundColor: 'var(--accent-pale)', color: 'var(--accent)' }}
        >
          {proyecto.status === 'ACTIVE' ? 'Activo' : proyecto.status}
        </span>
      </div>

      {/* Ubicación */}
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <MapPin className="w-3.5 h-3.5 shrink-0" />
        <span>{proyecto.city}, {proyecto.state}</span>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{proyecto.totalContratos}</p>
          <p className="text-xs mt-0.5 leading-tight" style={{ color: 'var(--text-secondary)' }}>Contratos</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{proyecto.lotesDisponibles}</p>
          <p className="text-xs mt-0.5 leading-tight" style={{ color: 'var(--text-secondary)' }}>Disponibles</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <p className="text-lg font-bold" style={{ color: 'var(--gold)' }}>{proyecto.lotesVendidos}</p>
          <p className="text-xs mt-0.5 leading-tight" style={{ color: 'var(--text-secondary)' }}>Vendidos</p>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>Progreso de ventas</span>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{pct}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: pct >= 75 ? 'var(--accent)' : 'var(--gold)' }}
          />
        </div>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{totalReal} lotes totales</p>
      </div>

      {/* Ingresos */}
      {proyecto.totalIngresos > 0 && !hideIngresos && (
        <div className="flex items-center gap-2 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
          <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Ingresos:</span>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(proyecto.totalIngresos)}</span>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProyectosPage() {
  const router = useRouter();
  const { canOnlyViewLots } = useRole();
  const { data: proyectos = [], isLoading, isError } = useProyectos();

  if (isLoading) return (
    <div className="space-y-4">
      <div className="h-7 w-40 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
      <GridSkeleton />
    </div>
  );

  if (isError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle className="w-10 h-10 text-red-400" />
      <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No se pudieron cargar los proyectos</p>
    </div>
  );

  const activos = proyectos.filter(p => p.status === 'ACTIVE').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Proyectos</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{activos} proyectos activos</p>
        </div>
      </div>

      {proyectos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Building2 className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }} />
          <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No hay proyectos registrados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {proyectos.map(p => (
            <ProyectoCard
              key={p.id}
              proyecto={p}
              onClick={() => router.push(`/proyectos/${p.id}`)}
              hideIngresos={canOnlyViewLots}
            />
          ))}
        </div>
      )}
    </div>
  );
}
