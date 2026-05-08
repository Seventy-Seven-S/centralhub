'use client';

import {
  FileText, AlertTriangle, DollarSign,
  MapPin, Clock, TrendingUp,
} from 'lucide-react';
import { useDashboardSummary } from '@/hooks/useDashboard';
import { useRole }            from '@/hooks/useRole';
import KPICard             from '@/components/dashboard/KPICard';
import DistribucionPlazo   from '@/components/dashboard/DistribucionPlazo';
import LotesDisponibles    from '@/components/dashboard/LotesDisponibles';
import { formatCurrency }  from '@/lib/utils';

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl ${className}`}
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    />
  );
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

export default function DashboardPage() {
  const { canAccessDashboard } = useRole();
  const { data, isLoading, isError, error } = useDashboardSummary();

  if (!canAccessDashboard) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--gold-pale)' }}
        >
          <AlertTriangle className="w-6 h-6" style={{ color: 'var(--gold)' }} />
        </div>
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          Acceso restringido
        </p>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          No tienes permisos para ver esta sección.
        </p>
      </div>
    );
  }

  if (isLoading) return <DashboardSkeleton />;

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle
            className="w-10 h-10 mx-auto mb-3"
            style={{ color: 'var(--danger)' }}
          />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
            No se pudo cargar el dashboard
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
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
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Resumen General
        </h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Monarca II — datos actualizados
        </p>
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

      {/* Métricas secundarias */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        <div
          className="rounded-2xl p-5"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-pale)' }}
            >
              <Clock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Cuotas Pendientes
            </p>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {cuotasPendientes.toLocaleString('es-MX')}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            en el plan de pagos activo
          </p>
        </div>

        <div
          className="rounded-2xl p-5"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--danger-pale)' }}
            >
              <AlertTriangle className="w-4 h-4" style={{ color: 'var(--danger)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Cuotas Vencidas
            </p>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--danger)' }}>
            {data.cuotas.vencidasSinPagar.toLocaleString('es-MX')}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            sin pago registrado
          </p>
        </div>

        <div
          className="rounded-2xl p-5"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-pale)' }}
            >
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--accent-hover)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Porcentaje Vendido
            </p>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--accent-hover)' }}>
            {data.lotes.porcentajeVendido}%
          </p>
          <div
            className="mt-2 w-full rounded-full h-1.5"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div
              className="h-1.5 rounded-full transition-all"
              style={{
                width: `${data.lotes.porcentajeVendido}%`,
                backgroundColor: 'var(--accent-hover)',
              }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
