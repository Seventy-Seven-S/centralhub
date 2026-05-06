'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileText, AlertCircle, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
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
  ACTIVE:   { bg: '#F0F9F4', color: '#166534', label: 'Activo' },
  IN_MORA:  { bg: '#FFF7ED', color: '#9A3412', label: 'En mora' },
  CLOSED:   { bg: '#F3F4F6', color: '#374151', label: 'Completado' },
  CANCELED: { bg: '#FEF2F2', color: '#991B1B', label: 'Cancelado' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { bg: '#F3F4F6', color: '#374151', label: status };
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
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3 animate-pulse">
      <div className="flex justify-between">
        <div className="h-5 w-20 bg-gray-200 rounded" />
        <div className="h-5 w-16 bg-gray-100 rounded-full" />
      </div>
      <div className="h-4 w-32 bg-gray-100 rounded" />
      <div className="grid grid-cols-3 gap-3 pt-1">
        {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}
      </div>
      <div className="h-2 bg-gray-100 rounded-full" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MisContratosPage() {
  const router   = useRouter();
  const { user } = useAuthStore();
  const clientId = user?.clientId;

  const { data: contratos = [], isLoading, isError } = useQuery<ContratoResumen[]>({
    queryKey:  ['mis-contratos', clientId],
    queryFn:   async () => {
      const { data } = await api.get('/contracts', { params: { clientId } });
      return data.data;
    },
    enabled:   !!clientId,
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis contratos</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isLoading ? 'Cargando…' : `${contratos.length} contrato${contratos.length !== 1 ? 's' : ''} activo${contratos.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className="text-gray-600 font-medium">No se pudieron cargar tus contratos</p>
        </div>
      ) : contratos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <FileText className="w-12 h-12 text-gray-300" />
          <p className="text-gray-500 font-medium">No tienes contratos registrados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {contratos.map(c => {
            const lot      = c.lots?.[0]?.lot;
            const loteLabel = lot ? `M${lot.manzana} L-${lot.lotNumber}` : '—';
            const pagado    = c.totalPrice - (c.balance ?? c.totalPrice);
            const pct       = c.totalPrice > 0 ? Math.min(100, Math.round((pagado / c.totalPrice) * 100)) : 0;

            return (
              <div
                key={c.id}
                onClick={() => router.push(`/mis-contratos/${c.id}`)}
                className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer p-5 space-y-4 border border-transparent hover:border-yellow-300"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-gray-900">{c.codigoLegado ?? c.id.slice(0, 8)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{c.project.name} · {loteLabel}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={c.status} />
                    {c.moraMonthsCount > 0 && (
                      <span className="text-xs font-medium" style={{ color: '#9A3412' }}>
                        {c.moraMonthsCount} mes{c.moraMonthsCount > 1 ? 'es' : ''} mora
                      </span>
                    )}
                  </div>
                </div>

                {/* Métricas */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 leading-tight">Precio total</p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5">{formatCurrency(c.totalPrice)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 leading-tight">Saldo</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: '#9A3412' }}>{formatCurrency(c.balance ?? 0)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 leading-tight">Mensualidad</p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5">{formatCurrency(c.installmentAmount ?? 0)}</p>
                  </div>
                </div>

                {/* Progreso */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Pagado</span>
                    <span className="font-semibold text-gray-700">{pct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#16a34a' : '#C9972C' }} />
                  </div>
                </div>

                <div className="flex items-center justify-end text-xs font-medium pt-1" style={{ color: '#C9972C' }}>
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
