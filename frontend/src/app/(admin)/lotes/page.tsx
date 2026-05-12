'use client';

import { useState, useMemo } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useLotes, Lote } from '@/hooks/useLotes';
import { formatCurrency } from '@/lib/utils';

const PROJECT_ID = '74b9deb6-a793-408d-8087-0e30ef0f288d';

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  AVAILABLE:   { bg: 'var(--accent)',      label: 'Disponible',    text: '#ffffff' },
  SOLD:        { bg: '#1A3A2A',            label: 'Vendido',       text: '#ffffff' },
  RESERVED:    { bg: 'var(--gold)',        label: 'Reservado',     text: '#ffffff' },
  UNAVAILABLE: { bg: 'var(--bg-tertiary)', label: 'No disponible', text: 'var(--text-secondary)' },
} as const;

// ── Modal de detalle de lote ──────────────────────────────────────────────────
function LoteModal({ lote, onClose }: { lote: Lote; onClose: () => void }) {
  const cfg = STATUS_CONFIG[lote.status];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-xl w-full max-w-sm" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Lote {lote.lotNumber} — M{lote.manzana}</h3>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mt-1"
              style={{ backgroundColor: cfg.bg, color: cfg.text }}
            >
              {cfg.label}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-3 text-sm">
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Superficie</span>
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{lote.areaM2.toFixed(2)} m²</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Precio base</span>
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{formatCurrency(lote.basePrice)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Precio actual</span>
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{formatCurrency(lote.currentPrice)}</span>
          </div>
          {lote.orientation && (
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>Orientación</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{lote.orientation}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function GridSkeleton() {
  return (
    <div className="space-y-6">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="rounded-2xl shadow-sm p-5 animate-pulse" style={{ backgroundColor: 'var(--surface)' }}>
          <div className="h-5 w-20 rounded mb-4" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
          <div className="flex flex-wrap gap-2">
            {[...Array(16)].map((_, j) => (
              <div key={j} className="w-14 h-14 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Cuadro de lote individual ─────────────────────────────────────────────────
function LoteBox({ lote, onClick }: { lote: Lote; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  const cfg = STATUS_CONFIG[lote.status];
  const clickable = lote.status === 'AVAILABLE';

  return (
    <div className="relative">
      <div
        onClick={clickable ? onClick : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="w-14 h-14 rounded-lg flex flex-col items-center justify-center select-none transition-transform"
        style={{
          backgroundColor: cfg.bg,
          cursor: clickable ? 'pointer' : 'default',
          transform: hovered ? 'scale(1.08)' : 'scale(1)',
        }}
      >
        <span className="text-xs font-bold leading-tight" style={{ color: cfg.text }}>
          {lote.lotNumber}
        </span>
        <span className="text-[9px] leading-tight opacity-80" style={{ color: cfg.text }}>
          {lote.areaM2.toFixed(0)}m²
        </span>
      </div>

      {/* Tooltip */}
      {hovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 pointer-events-none">
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
            <p className="font-semibold">L-{lote.lotNumber} · {lote.areaM2.toFixed(2)} m²</p>
            <p className="text-gray-300">{formatCurrency(lote.currentPrice)}</p>
            <p className="text-gray-400">{cfg.label}</p>
          </div>
          <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LotesPage() {
  const [filterManzana, setFilterManzana] = useState('todas');
  const [filterStatus,  setFilterStatus]  = useState('todos');
  const [selectedLote,  setSelectedLote]  = useState<Lote | null>(null);

  const { data: lotes = [], isLoading, isError } = useLotes(PROJECT_ID);

  const manzanas = useMemo(
    () => [...new Set(lotes.map(l => l.manzana))].sort((a, b) => a - b),
    [lotes]
  );

  const filtered = useMemo(() => {
    return lotes.filter(l => {
      if (filterManzana !== 'todas' && l.manzana !== parseInt(filterManzana)) return false;
      if (filterStatus  !== 'todos' && l.status !== filterStatus) return false;
      return true;
    });
  }, [lotes, filterManzana, filterStatus]);

  const byManzana = useMemo(() => {
    const map = new Map<number, Lote[]>();
    for (const l of filtered) {
      if (!map.has(l.manzana)) map.set(l.manzana, []);
      map.get(l.manzana)!.push(l);
    }
    for (const [, lots] of map) {
      lots.sort((a, b) => parseInt(a.lotNumber) - parseInt(b.lotNumber));
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [filtered]);

  if (isLoading) return (
    <div className="space-y-4">
      <div className="h-7 w-48 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
      <GridSkeleton />
    </div>
  );

  if (isError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle className="w-10 h-10 text-red-400" />
      <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No se pudieron cargar los lotes</p>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── SECCIÓN 1: Header + filtros ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Lotes — Monarca II</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{filtered.length} lotes encontrados</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterManzana}
            onChange={e => setFilterManzana(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-yellow-400/50 transition cursor-pointer"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="todas">Todas las manzanas</option>
            {manzanas.map(m => (
              <option key={m} value={m}>M{m}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-yellow-400/50 transition cursor-pointer"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="todos">Todos los status</option>
            <option value="AVAILABLE">Disponible</option>
            <option value="SOLD">Vendido</option>
            <option value="RESERVED">Reservado</option>
            <option value="UNAVAILABLE">No disponible</option>
          </select>
        </div>
      </div>

      {/* ── SECCIÓN 2: Grid por manzana ── */}
      {byManzana.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Sin lotes con los filtros seleccionados</p>
        </div>
      ) : (
        <div className="space-y-4">
          {byManzana.map(([manzana, lots]) => (
            <div key={manzana} className="rounded-2xl shadow-sm p-5" style={{ backgroundColor: 'var(--surface)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Manzana {manzana}</h3>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{lots.length} lotes</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {lots.map(lote => (
                  <LoteBox
                    key={lote.id}
                    lote={lote}
                    onClick={() => setSelectedLote(lote)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SECCIÓN 3: Leyenda ── */}
      <div className="rounded-2xl shadow-sm px-5 py-4" style={{ backgroundColor: 'var(--surface)' }}>
        <p className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Leyenda</p>
        <div className="flex flex-wrap gap-4">
          {(Object.entries(STATUS_CONFIG) as [keyof typeof STATUS_CONFIG, typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]][]).map(([, cfg]) => (
            <div key={cfg.label} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: cfg.bg }} />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {selectedLote && (
        <LoteModal lote={selectedLote} onClose={() => setSelectedLote(null)} />
      )}
    </div>
  );
}
