'use client';

// Dinero retenido: lo que un cliente pagó y ya no respalda ninguna obligación,
// porque su contrato se canceló o se traspasó sin devolvérselo.
//
// La pantalla dice explícitamente que ese dinero YA está contado en los
// ingresos. Sin esa línea, el primero que la vea lo va a sumar aparte y
// contará el total dos veces.

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Wallet } from 'lucide-react';
import api from '@/lib/api';
import { useRole } from '@/hooks/useRole';
import { formatCurrency, formatDateUTC } from '@/lib/utils';

interface Caso {
  contratoId: string;
  codigo: string;
  proyecto: string;
  cliente: string;
  origen: 'CANCELACION' | 'TRASPASO';
  pagado: number;
  devuelto: number;
  respetadoEnTraspaso: number;
  retenido: number;
  fecha: string | null;
}

interface Resumen {
  total: number;
  porOrigen: Array<{ origen: 'CANCELACION' | 'TRASPASO'; casos: number; monto: number }>;
  porProyecto: Array<{ proyecto: string; casos: number; monto: number }>;
  casos: Caso[];
}

const ORIGEN_LABEL = { CANCELACION: 'Por cancelación', TRASPASO: 'Por traspaso' } as const;

export default function DineroRetenidoPage() {
  const { isAdmin } = useRole();
  const { data, isLoading, isError } = useQuery<Resumen>({
    queryKey: ['dinero-retenido'],
    queryFn: async () => (await api.get('/dashboard/dinero-retenido')).data.data,
    enabled: isAdmin,
    staleTime: 60_000,
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-10 h-10" style={{ color: 'var(--gold)' }} />
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Acceso restringido</p>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Esta información del negocio solo la consulta un administrador.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-8 w-56 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        <div className="h-32 rounded-2xl" style={{ backgroundColor: 'var(--surface)' }} />
        <div className="h-64 rounded-2xl" style={{ backgroundColor: 'var(--surface)' }} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-10 h-10" style={{ color: 'var(--danger)' }} />
        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>No se pudo cargar</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Dinero retenido</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {data.casos.length} {data.casos.length === 1 ? 'contrato' : 'contratos'} cerrados con dinero sin devolver
        </p>
      </div>

      <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--surface)', border: '1.5px solid var(--gold)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Total retenido
            </p>
            <p className="text-4xl font-bold mt-2 tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {formatCurrency(data.total)}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--gold-pale)' }}>
            <Wallet className="w-6 h-6" style={{ color: 'var(--gold)' }} />
          </div>
        </div>

        <p className="text-xs mt-4 pt-4 leading-relaxed" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
          Este dinero <strong style={{ color: 'var(--text-secondary)' }}>ya está contado en los ingresos</strong> desde
          que el cliente lo pagó. Aquí solo se marca el que dejó de respaldar una obligación con alguien. No lo sumes
          aparte.
        </p>

        {data.porOrigen.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {data.porOrigen.map(o => (
              <div key={o.origen} className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>
                  {ORIGEN_LABEL[o.origen]} <span style={{ color: 'var(--text-tertiary)' }}>· {o.casos}</span>
                </span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(o.monto)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.porProyecto.length > 0 && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--surface)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>
            Por proyecto
          </p>
          <div className="space-y-1.5">
            {data.porProyecto.map(p => (
              <div key={p.proyecto} className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>
                  {p.proyecto} <span style={{ color: 'var(--text-tertiary)' }}>· {p.casos}</span>
                </span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(p.monto)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                {['Proy.', 'Contrato', 'Cliente', 'Pagado', 'Devuelto', 'Retenido', 'Fecha'].map((h, i) => (
                  <th key={h} className={`px-4 py-3 font-semibold whitespace-nowrap ${i >= 3 && i <= 5 ? 'text-right' : 'text-left'}`}
                      style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.casos.map(c => (
                <tr key={c.contratoId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.proyecto}</td>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{c.codigo}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{c.cliente}</td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {formatCurrency(c.pagado)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums"
                      style={{ color: c.devuelto > 0 ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    {c.devuelto > 0 ? formatCurrency(c.devuelto) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: 'var(--gold)' }}>
                    {formatCurrency(c.retenido)}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                    {c.fecha ? formatDateUTC(c.fecha) : 'sin fecha'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
