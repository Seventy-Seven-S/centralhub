'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#C9972C', '#0F1F3D', '#4A7CB5'];

interface Props {
  data: Array<{ plazoMeses: number; contratos: number }>;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-sm">
      <p className="font-semibold text-gray-800">{name}</p>
      <p className="text-gray-600">{value} contratos</p>
    </div>
  );
}

function CustomLegend({ data }: { data: Array<{ plazoMeses: number; contratos: number }> }) {
  return (
    <div className="flex justify-center gap-6 mt-3 flex-wrap">
      {data.map(({ plazoMeses, contratos }, i) => (
        <div key={plazoMeses} className="flex items-center gap-2 text-sm text-gray-600">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i] }} />
          <span>{plazoMeses} meses</span>
          <span className="font-semibold text-gray-800">({contratos})</span>
        </div>
      ))}
    </div>
  );
}

export default function DistribucionPlazo({ data }: Props) {
  const chartData = data.map(d => ({
    name:      `${d.plazoMeses} meses`,
    value:     d.contratos,
    plazoMeses: d.plazoMeses,
    contratos:  d.contratos,
  }));

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-800 mb-4">Distribución por Plazo</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <CustomLegend data={data} />
    </div>
  );
}
