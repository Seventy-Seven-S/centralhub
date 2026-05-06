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
  { key: 'Vendidos',    color: '#0F1F3D' },
  { key: 'Disponibles', color: '#22C55E' },
  { key: 'Reservados',  color: '#C9972C' },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-sm">
      <p className="font-semibold text-gray-800">{label}</p>
      <p className="text-gray-600">{payload[0].value} lotes</p>
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
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-800">Inventario de Lotes</h3>
        <span className="text-xs font-medium px-2 py-1 rounded-full"
              style={{ backgroundColor: '#FFF8EC', color: '#8A620A' }}>
          {pct}% vendido
        </span>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20 }}>
          <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} width={80} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F9FAFB' }} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
            {data.map((entry, i) => (
              <Cell key={i} fill={BARS[i].color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Totales */}
      <div className="flex justify-between pt-3 border-t border-gray-100 mt-2 text-sm">
        <span className="text-gray-500">Total lotes</span>
        <span className="font-semibold text-gray-800">{total}</span>
      </div>
    </div>
  );
}
