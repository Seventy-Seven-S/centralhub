'use client';

// Dashboard de trabajo para MANAGER (las secretarias).
//
// Existe porque el dashboard general abre con Ingresos / Egresos / Diferencia
// del negocio entero, y ellas lo tienen en pantalla mientras atienden a un
// cliente enfrente. El backend ya no les entrega esos montos
// (dashboard.routes.ts); esta pantalla es lo que sí les sirve para trabajar.
//
// El único monto aquí es el de SUS cobros de hoy — su propia operación, y el
// insumo directo de su corte diario al final del día.

import { DollarSign, AlertTriangle, Clock, Map, FileText } from 'lucide-react';
import { useDashboardOperativo } from '@/hooks/useDashboard';
import { useProjectSelection } from '@/contexts/ProjectContext';
import { formatCurrency } from '@/lib/utils';

function Tarjeta({
  icon: Icon, titulo, valor, subtitulo, acento, destacada = false,
}: {
  icon: typeof DollarSign; titulo: string; valor: string; subtitulo?: string; acento: string; destacada?: boolean;
}) {
  return (
    <div
      className="rounded-2xl shadow-sm p-5"
      style={{
        backgroundColor: 'var(--surface)',
        border: destacada ? `1.5px solid ${acento}` : '1px solid var(--border)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            {titulo}
          </p>
          <p
            className="mt-2 font-bold tracking-tight"
            style={{ color: 'var(--text-primary)', fontSize: destacada ? '2rem' : '1.5rem' }}
          >
            {valor}
          </p>
          {subtitulo && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{subtitulo}</p>
          )}
        </div>
        <div
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${acento}1A` }}
        >
          <Icon className="w-5 h-5" style={{ color: acento }} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardOperativo() {
  const { selectedProjectId, selectedProject } = useProjectSelection();
  const { data, isLoading, isError } = useDashboardOperativo(selectedProjectId ?? undefined);

  const hoy = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-7 w-56 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl" style={{ backgroundColor: 'var(--surface)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="w-10 h-10" style={{ color: 'var(--danger)' }} />
        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>No se pudo cargar tu tablero</p>
      </div>
    );
  }

  const VERDE = '#22C55E', AMBAR = '#F59E0B', ROJO = '#EF4444', AZUL = '#3B82F6';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Mi día</h2>
        <p className="text-sm mt-0.5 first-letter:uppercase" style={{ color: 'var(--text-secondary)' }}>
          {hoy}
          {selectedProject ? ` · ${selectedProject.name}` : ''}
        </p>
      </div>

      <Tarjeta
        icon={DollarSign}
        titulo="Cobrado por mí hoy"
        valor={formatCurrency(data.misCobrosHoy.total)}
        subtitulo={
          data.misCobrosHoy.count === 0
            ? 'Aún no registras cobros hoy'
            : `${data.misCobrosHoy.count} ${data.misCobrosHoy.count === 1 ? 'pago registrado' : 'pagos registrados'}`
        }
        acento={VERDE}
        destacada
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Tarjeta
          icon={AlertTriangle}
          titulo="Cuotas vencidas"
          valor={data.porCobrar.vencidas.toLocaleString('es-MX')}
          subtitulo="Pendientes de cobro"
          acento={ROJO}
        />
        <Tarjeta
          icon={Clock}
          titulo="Vencen esta semana"
          valor={data.porCobrar.vencenEstaSemana.toLocaleString('es-MX')}
          subtitulo="Próximos 7 días"
          acento={AMBAR}
        />
        <Tarjeta
          icon={FileText}
          titulo="Apartados por vencer"
          valor={data.apartadosPorVencer.toLocaleString('es-MX')}
          subtitulo="Requieren seguimiento"
          acento={AMBAR}
        />
        <Tarjeta
          icon={Map}
          titulo="Lotes disponibles"
          valor={data.inventario.lotesDisponibles.toLocaleString('es-MX')}
          subtitulo={`${data.inventario.contratosActivos.toLocaleString('es-MX')} contratos activos`}
          acento={AZUL}
        />
      </div>
    </div>
  );
}
