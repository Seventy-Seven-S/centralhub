'use client';

import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Label,
} from 'recharts';
import {
  FileText, AlertTriangle, DollarSign,
  MapPin, Clock, TrendingUp,
} from 'lucide-react';
import { useDashboardSummary, useMoraDetail } from '@/hooks/useDashboard';
import { useRole }        from '@/hooks/useRole';
import KPICard            from '@/components/dashboard/KPICard';
import DistribucionPlazo  from '@/components/dashboard/DistribucionPlazo';
import LotesDisponibles   from '@/components/dashboard/LotesDisponibles';
import { formatCurrency } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'ingresos' | 'lotes' | 'cuotas' | 'mora' | 'plazos';

const TABS: { id: Tab; label: string }[] = [
  { id: 'ingresos', label: 'Ingresos' },
  { id: 'lotes',    label: 'Lotes'    },
  { id: 'cuotas',   label: 'Cuotas'   },
  { id: 'mora',     label: 'Mora'     },
  { id: 'plazos',   label: 'Plazos'   },
];

// ── Skeleton ──────────────────────────────────────────────────────────────────
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
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-24" />)}
      </div>
      <Skeleton className="h-80" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    </div>
  );
}

// ── Tooltip compartido ────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, formatter }: any) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div style={{
      backgroundColor: 'var(--surface)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-md)',
      borderRadius: 10,
      padding: '8px 12px',
      fontSize: 13,
    }}>
      <p style={{ color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>{name}</p>
      <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0' }}>
        {formatter ? formatter(value) : value}
      </p>
    </div>
  );
}

// ── Tab: Ingresos ─────────────────────────────────────────────────────────────
function IngresosChart({ data }: { data: Array<{ mes: string; total: number }> }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        Ingresos mensuales
      </h3>
      {data.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 260 }}>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Sin datos disponibles</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={270}>
          <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#4A8C3F" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4A8C3F" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="mes"
              tick={{ fontSize: 11 }}
              style={{ fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: string) => v.split(' ')[0]}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              style={{ fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              width={52}
            />
            <Tooltip
              content={(props: any) =>
                <ChartTooltip {...props} formatter={(v: number) => formatCurrency(v)} />
              }
            />
            <Area
              type="monotone"
              dataKey="total"
              name="Ingresos"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="url(#greenGradient)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Tab: Cuotas ───────────────────────────────────────────────────────────────
const CUOTAS_CONFIG = [
  { key: 'PAGADA',    label: 'Pagadas',    color: '#1A3A2A' },
  { key: 'PENDIENTE', label: 'Pendientes', color: '#B8A054' },
  { key: 'VENCIDA',   label: 'Vencidas',  color: '#C05050' },
];

function CuotasChart({ porStatus }: { porStatus: Record<string, number> }) {
  const chartData = CUOTAS_CONFIG
    .map(({ key, label, color }) => ({ name: label, value: porStatus[key] ?? 0, color }))
    .filter(d => d.value > 0);
  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
        Estado de Cuotas
      </h3>
      <ResponsiveContainer width="100%" height={230}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={95}
            paddingAngle={3}
            dataKey="value"
            isAnimationActive={true}
            animationDuration={1000}
            animationEasing="ease-out"
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
            <Label
              content={({ viewBox }) => {
                const { cx, cy } = viewBox as { cx: number; cy: number };
                return (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={cx} dy="-0.5em" fontSize="28" fontWeight="700"
                      style={{ fill: 'var(--text-primary)' }}>
                      {total.toLocaleString('es-MX')}
                    </tspan>
                    <tspan x={cx} dy="1.5em" fontSize="11"
                      style={{ fill: 'var(--text-tertiary)' }}>
                      cuotas
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
          <Tooltip
            content={(props: any) =>
              <ChartTooltip {...props} formatter={(v: number) => `${v.toLocaleString('es-MX')} cuotas`} />
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-3 gap-2 mt-1">
        {chartData.map(({ name, color, value }) => (
          <div key={name} className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{name}</span>
            </div>
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {value.toLocaleString('es-MX')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Mora ─────────────────────────────────────────────────────────────────
type MoraRow = {
  contractId:     string;
  codigoLegado:   string;
  clientName:     string;
  cuotasVencidas: number;
  montoRiesgo:    number;
};

function MoraTable({ mora, loading }: { mora: any[] | undefined; loading: boolean }) {
  if (loading) return <Skeleton className="h-72" />;

  const rows = (Object.values(
    (mora ?? []).reduce((acc: Record<string, MoraRow>, cuota: any) => {
      const c = cuota.contract;
      if (!acc[c.id]) {
        acc[c.id] = {
          contractId:     c.id,
          codigoLegado:   c.codigoLegado ?? '—',
          clientName:     `${c.client.firstName} ${c.client.lastName}`,
          cuotasVencidas: 0,
          montoRiesgo:    0,
        };
      }
      acc[c.id].cuotasVencidas += 1;
      acc[c.id].montoRiesgo   += cuota.montoEsperado ?? 0;
      return acc;
    }, {})
  ) as MoraRow[])
    .sort((a, b) => b.cuotasVencidas - a.cuotasVencidas)
    .slice(0, 10);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          Contratos en mora
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          Top 10 por cuotas vencidas
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Cliente', 'Contrato', 'Cuotas vencidas', 'Monto en riesgo'].map((h, i) => (
                <th
                  key={h}
                  className={`px-5 py-3 text-xs font-semibold ${i >= 2 ? 'text-right' : 'text-left'}`}
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-sm"
                    style={{ color: 'var(--text-tertiary)' }}>
                  Sin contratos en mora
                </td>
              </tr>
            ) : rows.map(row => (
              <tr
                key={row.contractId}
                style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
              >
                <td className="px-5 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {row.clientName}
                </td>
                <td className="px-5 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {row.codigoLegado}
                </td>
                <td className="px-5 py-3 text-sm text-right font-semibold" style={{ color: 'var(--danger)' }}>
                  {row.cuotasVencidas}
                </td>
                <td className="px-5 py-3 text-sm text-right font-medium" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(row.montoRiesgo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('ingresos');
  const { canAccessDashboard }    = useRole();
  const { data, isLoading, isError, error } = useDashboardSummary();
  const { data: mora, isLoading: moraLoading } = useMoraDetail(activeTab === 'mora');

  if (!canAccessDashboard) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
             style={{ backgroundColor: 'var(--gold-pale)' }}>
          <AlertTriangle className="w-6 h-6" style={{ color: 'var(--gold)' }} />
        </div>
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Acceso restringido</p>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No tienes permisos para ver esta sección.</p>
      </div>
    );
  }

  if (isLoading) return <DashboardSkeleton />;

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>No se pudo cargar el dashboard</p>
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
        <KPICard icon={FileText}      title="Total Contratos"   value={data.contratos.total}                subtitle={`${data.contratos.enMora} en mora`} />
        <KPICard icon={AlertTriangle} title="Contratos en Mora" value={data.contratos.enMora}               subtitle={`${data.cuotas.vencidasSinPagar} cuotas vencidas`} alert={data.contratos.enMora > 0} />
        <KPICard icon={DollarSign}    title="Ingresos Totales"  value={formatCurrency(data.ingresos.total)} subtitle={`${data.ingresos.totalPagos} pagos registrados`} accent="#22C55E" />
        <KPICard icon={MapPin}        title="Lotes Disponibles" value={data.lotes.disponibles}              subtitle={`de ${data.lotes.total} lotes totales`} accent="#4A7CB5" />
      </div>

      {/* Tab selector */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150"
            style={
              activeTab === tab.id
                ? { backgroundColor: 'var(--accent)', color: '#ffffff' }
                : {
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Gráfica activa */}
      <div>
        {activeTab === 'ingresos' && <IngresosChart data={data.ingresosPorMes ?? []} />}
        {activeTab === 'lotes'    && (
          <LotesDisponibles
            disponibles={data.lotes.disponibles}
            vendidos={data.lotes.vendidos}
            reservados={data.lotes.reservados}
            total={data.lotes.total}
          />
        )}
        {activeTab === 'cuotas'   && <CuotasChart porStatus={data.cuotas.porStatus} />}
        {activeTab === 'mora'     && <MoraTable mora={mora} loading={moraLoading} />}
        {activeTab === 'plazos'   && <DistribucionPlazo data={data.distribucionPlazo} />}
      </div>

      {/* Métricas secundarias */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-pale)' }}>
              <Clock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Cuotas Pendientes</p>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{cuotasPendientes.toLocaleString('es-MX')}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>en el plan de pagos activo</p>
        </div>

        <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--danger-pale)' }}>
              <AlertTriangle className="w-4 h-4" style={{ color: 'var(--danger)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Cuotas Vencidas</p>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--danger)' }}>{data.cuotas.vencidasSinPagar.toLocaleString('es-MX')}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>sin pago registrado</p>
        </div>

        <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-pale)' }}>
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--accent-hover)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Porcentaje Vendido</p>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--accent-hover)' }}>{data.lotes.porcentajeVendido}%</p>
          <div className="mt-2 w-full rounded-full h-1.5" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <div className="h-1.5 rounded-full transition-all"
                 style={{ width: `${data.lotes.porcentajeVendido}%`, backgroundColor: 'var(--accent-hover)' }} />
          </div>
        </div>

      </div>
    </div>
  );
}
