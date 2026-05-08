'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

interface Props {
  disponibles: number;
  vendidos:    number;
  reservados:  number;
  total:       number;
}

const BARS = [
  { key: 'Vendidos',    color: '#1A3A2A' },
  { key: 'Disponibles', color: 'var(--accent-hover)' },
  { key: 'Reservados',  color: 'var(--gold)' },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
      <p style={{ color: 'var(--text-secondary)' }}>{payload[0].value} lotes</p>
    </div>
  );
}

export default function LotesDisponibles({ disponibles, vendidos, reservados, total }: Props) {
  const data = [
    { name: 'Vendidos',    value: vendidos    },
    { name: 'Disponibles', value: disponibles },
    { name: 'Reservados',  value: reservados  },
  ];

  const pct = total > 0 ? Math.round((vendidos / total) * 100) : 0;

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          Inventario de Lotes
        </h3>
        <span
          className="text-xs font-medium px-2 py-1 rounded-full"
          style={{ backgroundColor: 'var(--accent-pale)', color: 'var(--accent)' }}
        >
          {pct}% vendido
        </span>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20 }}>
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12, fill: 'var(--text-tertiary)' }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-tertiary)' }} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
            {data.map((_, i) => (
              <Cell key={i} fill={BARS[i].color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Totales */}
      <div
        className="flex justify-between pt-3 mt-2 text-sm"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <span style={{ color: 'var(--text-secondary)' }}>Total lotes</span>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{total}</span>
      </div>
    </div>
  );
}
