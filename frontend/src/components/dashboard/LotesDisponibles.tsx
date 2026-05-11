'use client';

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Label,
} from 'recharts';

interface Props {
  disponibles: number;
  vendidos:    number;
  reservados:  number;
  total:       number;
}

const SEGMENTS = [
  { key: 'vendidos',    label: 'Vendidos',    color: '#1A3A2A' },
  { key: 'disponibles', label: 'Disponibles', color: '#5FA854' },
  { key: 'reservados',  label: 'Reservados',  color: '#B8A054' },
] as const;

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
      <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0' }}>{value} lotes</p>
    </div>
  );
}

export default function LotesDisponibles({ disponibles, vendidos, reservados, total }: Props) {
  const values = { vendidos, disponibles, reservados };
  const pct = total > 0 ? Math.round((vendidos / total) * 100) : 0;

  const chartData = SEGMENTS.map(({ key, label, color }) => ({
    name:  label,
    value: values[key],
    color,
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
      <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
        Inventario de Lotes
      </h3>

      {/* Donut */}
      <ResponsiveContainer width="100%" height={220}>
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
                    <tspan
                      x={cx} dy="-0.5em"
                      fontSize="28" fontWeight="700"
                      style={{ fill: 'var(--text-primary)' }}
                    >
                      {pct}%
                    </tspan>
                    <tspan
                      x={cx} dy="1.5em"
                      fontSize="11"
                      style={{ fill: 'var(--text-tertiary)' }}
                    >
                      vendido
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {chartData.map(({ name, color, value }) => (
          <div key={name} className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{name}</span>
            </div>
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Total */}
      <div
        className="flex justify-between pt-3 text-sm"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <span style={{ color: 'var(--text-secondary)' }}>Total lotes</span>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{total}</span>
      </div>
    </div>
  );
}
