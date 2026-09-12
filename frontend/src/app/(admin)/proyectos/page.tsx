'use client';

import { useRouter } from 'next/navigation';
import { useState, useMemo, useRef } from 'react';
import { aplicarOrden, mover } from '@/lib/ordenProyectos';
import { Building2, MapPin, TrendingUp, AlertCircle, TrendingDown, GripVertical } from 'lucide-react';
import { useProyectos, useOrdenProyectos, Proyecto } from '@/hooks/useProyectos';
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
function ProyectoCard({ proyecto, onClick, hideIngresos, arrastrable, arrastrando, onDragStart, onDragEnter, onDragEnd }: {
  proyecto: Proyecto; onClick: () => void; hideIngresos: boolean;
  arrastrable: boolean; arrastrando: boolean;
  onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void;
}) {
  const totalReal  = proyecto.lotesVendidos + proyecto.lotesDisponibles;
  const pct        = totalReal > 0 ? Math.min(100, Math.round((proyecto.lotesVendidos / totalReal) * 100)) : 0;
  const diferencia = proyecto.totalIngresos - proyecto.totalEgresos;

  return (
    <div
      onClick={onClick}
      draggable={arrastrable}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDragOver={e => e.preventDefault()}
      className="rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer p-5 space-y-4"
      style={{
        backgroundColor: 'var(--surface)',
        border: `1px solid ${arrastrando ? 'var(--accent)' : 'var(--border)'}`,
        opacity: arrastrando ? 0.5 : 1,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {arrastrable && (
            <GripVertical
              className="w-4 h-4 mt-0.5 shrink-0 cursor-grab active:cursor-grabbing"
              style={{ color: 'var(--text-tertiary)' }}
            />
          )}
        <div>
          <h3 className="font-bold text-base leading-tight" style={{ color: 'var(--text-primary)' }}>{proyecto.name}</h3>
          <span className="text-xs font-mono mt-0.5 block" style={{ color: 'var(--text-tertiary)' }}>{proyecto.code}</span>
        </div>
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

      {/* Finanzas */}
      {!hideIngresos && (proyecto.totalIngresos > 0 || proyecto.totalEgresos > 0) && (
        <div className="pt-2 space-y-1" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <TrendingUp className="w-3.5 h-3.5" /> Ingresos
            </span>
            <span className="font-semibold" style={{ color: 'var(--accent)' }}>{formatCurrency(proyecto.totalIngresos)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <TrendingDown className="w-3.5 h-3.5" /> Egresos
            </span>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(proyecto.totalEgresos)}</span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1" style={{ borderTop: '1px dashed var(--border)' }}>
            <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Diferencia</span>
            <span className="font-bold" style={{ color: diferencia < 0 ? 'var(--danger)' : 'var(--accent)' }}>
              {formatCurrency(diferencia)}
            </span>
          </div>
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
  const { orden, guardar } = useOrdenProyectos();

  // El orden que se ve sale de reconciliar el guardado con lo que manda el
  // servidor: un proyecto nuevo aparece al final en vez de perderse.
  const ordenados = useMemo(() => aplicarOrden(proyectos, orden), [proyectos, orden]);

  const [arrastrado, setArrastrado] = useState<string | null>(null);
  const [vista, setVista] = useState<string[] | null>(null);
  // Distingue arrastrar de hacer clic: sin esto, soltar una tarjeta abre el
  // proyecto además de reacomodarlo.
  const moviendo = useRef(false);

  const lista = vista
    ? (vista.map(id => ordenados.find(p => p.id === id)).filter(Boolean) as typeof ordenados)
    : ordenados;

  function alEntrar(id: string) {
    if (!arrastrado || arrastrado === id) return;
    const ids = lista.map(p => p.id);
    const nuevos = mover(ids, ids.indexOf(arrastrado), ids.indexOf(id));
    moviendo.current = true;
    setVista(nuevos);
  }

  function alSoltar() {
    if (vista) guardar.mutate(vista);
    setArrastrado(null);
    setVista(null);
    // Se libera en el siguiente tick para que el clic que sigue al soltar no
    // navegue al proyecto.
    setTimeout(() => { moviendo.current = false; }, 0);
  }

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
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {activos} proyectos activos · arrastra las tarjetas para acomodarlas
          </p>
        </div>
      </div>

      {proyectos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Building2 className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }} />
          <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No hay proyectos registrados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {lista.map(p => (
            <ProyectoCard
              key={p.id}
              proyecto={p}
              onClick={() => { if (!moviendo.current) router.push(`/proyectos/${p.id}`); }}
              hideIngresos={canOnlyViewLots}
              arrastrable
              arrastrando={arrastrado === p.id}
              onDragStart={() => setArrastrado(p.id)}
              onDragEnter={() => alEntrar(p.id)}
              onDragEnd={alSoltar}
            />
          ))}
        </div>
      )}
    </div>
  );
}
