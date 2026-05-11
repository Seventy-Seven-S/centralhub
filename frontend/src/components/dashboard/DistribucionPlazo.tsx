'use client';

import {
  RadialBarChart, RadialBar, ResponsiveContainer, Tooltip,
} from 'recharts';

const COLORS = ['#1A3A2A', '#4A8C3F', '#7AB5A0', '#4A9A6A'];

interface Props {
  data: Array<{ plazoMeses: number; contratos: number }>;
}

function CustomTooltip({ active, payload }: any) {
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
      <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0' }}>{value} contratos</p>
    </div>
  );
}

export default function DistribucionPlazo({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.contratos, 0);

  const chartData = data.map(({ plazoMeses, contratos }, i) => ({
    name:  `${plazoMeses} meses`,
    value: contratos,
    fill:  COLORS[i % COLORS.length],
  }));

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Header */}
      <div className="mb-2">
        <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-secondary)' }}>
          Contratos activos
        </p>
        <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {total}
        </p>
      </div>

      {/* RadialBarChart */}
      <ResponsiveContainer width="100%" height={220}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="30%"
          outerRadius="90%"
          startAngle={180}
          endAngle={-180}
          data={chartData}
        >
          <RadialBar
            dataKey="value"
            isAnimationActive={true}
            animationDuration={1200}
            animationEasing="ease-out"
            background={{ fill: 'rgba(128,128,128,0.10)' }}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadialBarChart>
      </ResponsiveContainer>

      {/* Leyenda */}
      <div className="space-y-2 mt-1">
        {data.map(({ plazoMeses, contratos }, i) => {
          const pct = total > 0 ? Math.round((contratos / total) * 100) : 0;
          return (
            <div key={plazoMeses} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {plazoMeses} meses
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: 'var(--accent-pale)', color: 'var(--accent)' }}
                >
                  {pct}%
                </span>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {contratos}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
