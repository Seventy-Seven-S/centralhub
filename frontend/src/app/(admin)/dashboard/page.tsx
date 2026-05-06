'use client';

import {
  FileText, AlertTriangle, DollarSign,
  MapPin, Clock, TrendingUp,
} from 'lucide-react';
import { useDashboardSummary } from '@/hooks/useDashboard';
import KPICard             from '@/components/dashboard/KPICard';
import DistribucionPlazo   from '@/components/dashboard/DistribucionPlazo';
import LotesDisponibles    from '@/components/dashboard/LotesDisponibles';
import { formatCurrency }  from '@/lib/utils';

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-xl ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data, isLoading, isError, error } = useDashboardSummary();

  if (isLoading) return <DashboardSkeleton />;

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No se pudo cargar el dashboard</p>
          <p className="text-sm text-gray-400 mt-1">
            {(error as any)?.message ?? 'Error de conexión con el servidor'}
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const cuotasPendientes = data.cuotas.porStatus['PENDIENTE'] ?? 0;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Resumen General</h2>
        <p className="text-sm text-gray-500 mt-0.5">Monarca II — datos actualizados</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          icon={FileText}
          title="Total Contratos"
          value={data.contratos.total}
          subtitle={`${data.contratos.enMora} en mora`}
        />
        <KPICard
          icon={AlertTriangle}
          title="Contratos en Mora"
          value={data.contratos.enMora}
          subtitle={`${data.cuotas.vencidasSinPagar} cuotas vencidas`}
          alert={data.contratos.enMora > 0}
        />
        <KPICard
          icon={DollarSign}
          title="Ingresos Totales"
          value={formatCurrency(data.ingresos.total)}
          subtitle={`${data.ingresos.totalPagos} pagos registrados`}
          accent="#22C55E"
        />
        <KPICard
          icon={MapPin}
          title="Lotes Disponibles"
          value={data.lotes.disponibles}
          subtitle={`de ${data.lotes.total} lotes totales`}
          accent="#4A7CB5"
        />
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DistribucionPlazo data={data.distribucionPlazo} />
        <LotesDisponibles
          disponibles={data.lotes.disponibles}
          vendidos={data.lotes.vendidos}
          reservados={data.lotes.reservados}
          total={data.lotes.total}
        />
      </div>

      {/* Fila de métricas secundarias */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{ backgroundColor: '#EFF6FF' }}>
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-sm font-medium text-gray-600">Cuotas Pendientes</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{cuotasPendientes.toLocaleString('es-MX')}</p>
          <p className="text-xs text-gray-400 mt-1">en el plan de pagos activo</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{ backgroundColor: '#FFF7ED' }}>
              <AlertTriangle className="w-4 h-4 text-orange-500" />
            </div>
            <p className="text-sm font-medium text-gray-600">Cuotas Vencidas</p>
          </div>
          <p className="text-2xl font-bold text-orange-600">{data.cuotas.vencidasSinPagar.toLocaleString('es-MX')}</p>
          <p className="text-xs text-gray-400 mt-1">sin pago registrado</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{ backgroundColor: '#F0FDF4' }}>
              <TrendingUp className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-sm font-medium text-gray-600">Porcentaje Vendido</p>
          </div>
          <p className="text-2xl font-bold text-green-600">{data.lotes.porcentajeVendido}%</p>
          <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all"
              style={{ width: `${data.lotes.porcentajeVendido}%`, backgroundColor: '#22C55E' }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
