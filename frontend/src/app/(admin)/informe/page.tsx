'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, AlertCircle, Download } from 'lucide-react';
import api from '@/lib/api';
// Siempre con centavos, como en un estado de cuenta: con el formato general
// unos meses salían "$1,549,734.5" y otros "$443,882".
const pesos = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
import { useProjectSelection } from '@/contexts/ProjectContext';
import { useRole } from '@/hooks/useRole';

interface Informe {
  proyecto: { id: string; code: string; name: string };
  filas: Array<{ periodo: string; mes: string; ingresos: number; egresos: number }>;
  totales: { ingresos: number; egresos: number };
}

// Ingresos y egresos de cada mes del proyecto, desde su primer movimiento.
// Sin desglose por tipo de pago ni por categoría: es el resumen para
// reportar. Lo ven el ADMIN y el socio del proyecto.
export default function InformePage() {
  const { isAdmin, isSocio } = useRole();
  const { selectedProjectId, setSelectedProjectId, projects } = useProjectSelection();
  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const puedeVer = isAdmin || isSocio;

  const { data: informe, isLoading, isError } = useQuery<Informe>({
    enabled: puedeVer && !!selectedProjectId,
    queryKey: ['informe', selectedProjectId],
    queryFn: async () => (await api.get(`/informes/proyecto/${selectedProjectId}`)).data.data,
  });

  const descargar = async () => {
    if (!selectedProjectId) return;
    setDescargando(true);
    setErrorDescarga(null);
    try {
      const res = await api.get(`/informes/proyecto/${selectedProjectId}/excel`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `informe-${informe?.proyecto.code ?? 'proyecto'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrorDescarga('No se pudo descargar el Excel');
    } finally {
      setDescargando(false);
    }
  };

  if (!puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-10 h-10" style={{ color: 'var(--gold)' }} />
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Acceso restringido</p>
      </div>
    );
  }

  // Las filas van del mes más reciente al más viejo: lo que se consulta casi
  // siempre es lo último. El Excel sí va en orden cronológico.
  const filas = informe ? [...informe.filas].reverse() : [];
  const inputStyle = { border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Informe por proyecto</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Ingresos y egresos de cada mes{informe?.filas.length ? `, desde ${informe.filas[0].mes}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Proyecto"
            value={selectedProjectId ?? ''}
            onChange={e => setSelectedProjectId(e.target.value || null)}
            className="rounded-xl px-3 py-2.5 text-sm outline-none"
            style={inputStyle}
          >
            {!selectedProjectId && <option value="">Elige un proyecto</option>}
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={descargar}
            disabled={!informe || descargando}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 whitespace-nowrap"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Download className="w-4 h-4" />
            {descargando ? 'Descargando…' : 'Exportar a Excel'}
          </button>
        </div>
      </div>

      {errorDescarga && <p className="text-sm" style={{ color: 'var(--danger)' }}>{errorDescarga}</p>}

      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
        {!selectedProjectId ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <BarChart3 className="w-10 h-10" style={{ color: 'var(--bg-tertiary)' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Elige un proyecto para ver su informe</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p style={{ color: 'var(--text-secondary)' }}>No se pudo cargar el informe</p>
          </div>
        ) : isLoading || !informe ? (
          <div className="p-5 space-y-2 animate-pulse">
            {[...Array(8)].map((_, i) => <div key={i} className="h-10 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}
          </div>
        ) : filas.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <BarChart3 className="w-10 h-10" style={{ color: 'var(--bg-tertiary)' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Este proyecto todavía no tiene movimientos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                  <th className="px-5 py-3 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Mes</th>
                  <th className="px-5 py-3 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>Ingresos</th>
                  <th className="px-5 py-3 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>Egresos</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.periodo} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-5 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{f.mes}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums whitespace-nowrap" style={{ color: f.ingresos < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{pesos(f.ingresos)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{pesos(f.egresos)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <td className="px-5 py-3 font-bold" style={{ color: 'var(--text-primary)' }}>Total</td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{pesos(informe.totales.ingresos)}</td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{pesos(informe.totales.egresos)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
