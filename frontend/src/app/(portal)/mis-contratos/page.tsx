'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileText, AlertCircle, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface ContratoResumen {
  id:              string;
  codigoLegado:    string | null;
  status:          string;
  totalPrice:      number;
  balance:         number | null;
  installmentAmount: number | null;
  moraMonthsCount: number;
  lots: Array<{ lot: { lotNumber: string; manzana: number } }>;
  project: { name: string; code: string };
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  ACTIVE:   { bg: 'var(--success-bg)', color: 'var(--success)',        label: 'Activo' },
  IN_MORA:  { bg: 'var(--danger-bg)',  color: 'var(--danger)',         label: 'En mora' },
  CLOSED:   { bg: 'var(--bg-tertiary)',color: 'var(--text-secondary)', label: 'Completado' },
  CANCELED: { bg: 'var(--danger-bg)',  color: 'var(--danger)',         label: 'Cancelado' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { bg: 'var(--bg-tertiary)', color: 'var(--text-secondary)', label: status };
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="rounded-2xl p-5 space-y-3 animate-pulse" style={{ backgroundColor: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex justify-between">
        <div className="h-5 w-20 rounded" style={{ backgroundColor: 'var(--border)' }} />
        <div className="h-5 w-16 rounded-full" style={{ backgroundColor: 'var(--bg-secondary)' }} />
      </div>
      <div className="h-4 w-32 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }} />
      <div className="grid grid-cols-3 gap-3 pt-1">
        {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}
      </div>
      <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--bg-secondary)' }} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MisContratosPage() {
  const router = useRouter();

  const { data: contratos = [], isLoading, isError } = useQuery<ContratoResumen[]>({
    queryKey:  ['mis-contratos'],
    queryFn:   async () => {
      const { data } = await api.get('/portal/contratos');
      return data.data;
    },
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Mis contratos</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {isLoading ? 'Cargando…' : `${contratos.length} contrato${contratos.length !== 1 ? 's' : ''} activo${contratos.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <AlertCircle className="w-10 h-10" style={{ color: 'var(--danger)' }} />
          <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No se pudieron cargar tus contratos</p>
        </div>
      ) : contratos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <FileText className="w-12 h-12" style={{ color: 'var(--text-tertiary)' }} />
          <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No tienes contratos registrados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {contratos.map(c => {
            const lot       = c.lots?.[0]?.lot;
            const loteLabel = lot ? `M${lot.manzana} L-${lot.lotNumber}` : '—';
            const pagado    = c.totalPrice - (c.balance ?? c.totalPrice);
            const pct       = c.totalPrice > 0 ? Math.min(100, Math.round((pagado / c.totalPrice) * 100)) : 0;

            return (
              <div
                key={c.id}
                onClick={() => router.push(`/mis-contratos/${c.id}`)}
                className="rounded-2xl cursor-pointer p-5 space-y-4 border transition-shadow"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'transparent', boxShadow: 'var(--shadow-sm)' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)';
                  (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                  (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{c.codigoLegado ?? c.id.slice(0, 8)}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{c.project.name} · {loteLabel}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={c.status} />
                    {c.moraMonthsCount > 0 && (
                      <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
                        {c.moraMonthsCount} mes{c.moraMonthsCount > 1 ? 'es' : ''} mora
                      </span>
                    )}
                  </div>
                </div>

                {/* Métricas */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <p className="text-xs leading-tight" style={{ color: 'var(--text-secondary)' }}>Precio total</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>{formatCurrency(c.totalPrice)}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <p className="text-xs leading-tight" style={{ color: 'var(--text-secondary)' }}>Saldo</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--danger)' }}>{formatCurrency(c.balance ?? 0)}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <p className="text-xs leading-tight" style={{ color: 'var(--text-secondary)' }}>Mensualidad</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>{formatCurrency(c.installmentAmount ?? 0)}</p>
                  </div>
                </div>

                {/* Progreso */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span>Pagado</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? 'var(--success)' : 'var(--gold)' }} />
                  </div>
                </div>

                <div className="flex items-center justify-end text-xs font-medium pt-1" style={{ color: 'var(--gold)' }}>
                  Ver detalle <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
