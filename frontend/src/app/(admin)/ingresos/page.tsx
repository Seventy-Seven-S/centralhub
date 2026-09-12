'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency, formatDateUTC, normalizeForSearch } from '@/lib/utils';
import { resumirPorTipo, filtrarPorTipo, etiquetaTipo } from '@/lib/ingresos';
import ChipResumen from '@/components/ui/ChipResumen';
import { useProjectSelection } from '@/contexts/ProjectContext';
import { useRole } from '@/hooks/useRole';

interface Ingreso {
  id: string;
  paymentNumber: string;
  paymentType: string;
  paymentMethod: string;
  amount: number;
  paymentDate: string;
  concept: string;
  contract: {
    id: string; contractNumber: string; codigoLegado: string | null;
    client: { firstName: string; lastName: string };
    lots: Array<{ lot: { manzana: number; lotNumber: string } }>;
  };
  corte: { id: string; numero: number; fecha: string } | null;
}

const PAGE_SIZE = 50;

export default function IngresosPage() {
  const router = useRouter();
  const { isAdmin } = useRole();
  const { selectedProjectId } = useProjectSelection();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // El backend ya responde 403 al listado global si no eres ADMIN; esto evita
  // que un MANAGER que llegue por URL vea una pantalla de error en vez de un
  // mensaje claro, y de paso no dispara la petición.
  const { data: ingresos = [], isLoading, isError } = useQuery<Ingreso[]>({
    enabled: isAdmin,
    queryKey: ['ingresos', selectedProjectId ?? 'all', desde, hasta],
    queryFn: async () => (await api.get('/payments', { params: { projectId: selectedProjectId ?? undefined, startDate: desde || undefined, endDate: hasta ? `${hasta}T23:59:59` : undefined, status: 'CONFIRMED' } })).data.data,
  });

  // Busqueda y fechas primero; el resumen por tipo se calcula sobre eso, de modo
  // que las cifras de cada chip responden a los filtros activos. El tipo se
  // aplica hasta despues: si no, al elegir "Enganche" los demas chips dirian 0.
  const buscados = useMemo(() => {
    const n = normalizeForSearch(q.trim());
    const list = n
      ? ingresos.filter(i => normalizeForSearch(`${i.contract.client.firstName} ${i.contract.client.lastName}`).includes(n) || normalizeForSearch(i.contract.codigoLegado ?? '').includes(n) || normalizeForSearch(i.paymentNumber).includes(n))
      : ingresos;
    return [...list].sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
  }, [ingresos, q]);

  const resumen = useMemo(() => resumirPorTipo(buscados), [buscados]);
  const filtrados = useMemo(() => filtrarPorTipo(buscados, tipo), [buscados, tipo]);

  const total = useMemo(() => filtrados.reduce((a, i) => a + i.amount, 0), [filtrados]);
  const totalGeneral = useMemo(() => buscados.reduce((a, i) => a + i.amount, 0), [buscados]);
  const elegirTipo = (t: string | null) => { setTipo(t); setPage(1); };
  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pagina = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const inputStyle = { border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-10 h-10" style={{ color: 'var(--gold)' }} />
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Acceso restringido</p>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Los ingresos del negocio solo los consulta un administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Ingresos</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {isLoading ? 'Cargando…' : `${filtrados.length} pagos · ${formatCurrency(total)}`}{tipo && ` · ${etiquetaTipo(tipo)}`}{!selectedProjectId && ' · todos los proyectos'}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Buscar por cliente, código o folio…" className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none" style={inputStyle} />
        <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1); }} className="rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} title="Desde" />
        <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1); }} className="rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} title="Hasta" />
      </div>

      {resumen.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <ChipResumen activo={tipo === null} onClick={() => elegirTipo(null)} etiqueta="Todos" cantidad={buscados.length} monto={totalGeneral} />
          {resumen.map(r => (
            <ChipResumen key={r.tipo} activo={tipo === r.tipo} onClick={() => elegirTipo(r.tipo)} etiqueta={r.etiqueta} cantidad={r.pagos} monto={r.monto} />
          ))}
        </div>
      )}

      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
        {isError ? (
          <div className="flex flex-col items-center py-16 gap-2"><AlertCircle className="w-8 h-8 text-red-400" /><p style={{ color: 'var(--text-secondary)' }}>No se pudieron cargar los ingresos</p></div>
        ) : isLoading ? (
          <div className="p-5 space-y-2 animate-pulse">{[...Array(8)].map((_, i) => <div key={i} className="h-10 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}</div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2"><DollarSign className="w-10 h-10" style={{ color: 'var(--bg-tertiary)' }} /><p style={{ color: 'var(--text-secondary)' }}>Sin ingresos con estos filtros</p></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                    {['Fecha', 'Folio', 'Código', 'Cliente', 'Lote', 'Concepto', 'Tipo', 'Corte', 'Monto'].map((h, i) => (
                      <th key={h} className={`px-4 py-3 font-semibold whitespace-nowrap ${i === 8 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text-secondary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagina.map(i => (
                    <tr key={i.id} onClick={() => router.push(`/contratos/${i.contract.id}`)} className="cursor-pointer hover:bg-[var(--bg-secondary)]" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{formatDateUTC(i.paymentDate, 'short')}</td>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{i.paymentNumber}</td>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{i.contract.codigoLegado ?? '—'}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{i.contract.client.firstName} {i.contract.client.lastName}</td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{i.contract.lots.map(l => `M${l.lot.manzana}-${l.lot.lotNumber}`).join(' ')}</td>
                      <td className="px-4 py-2.5 max-w-[220px] truncate" style={{ color: 'var(--text-secondary)' }}>{i.concept}</td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{etiquetaTipo(i.paymentType)}</td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: i.corte ? 'var(--text-secondary)' : 'var(--gold)' }}>{i.corte ? `#${i.corte.numero}` : 'Pendiente'}</td>
                      <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap" style={{ color: i.amount < 0 ? 'var(--danger)' : 'var(--accent)' }}>{formatCurrency(i.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 text-sm" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <span>Página {page} de {totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ border: '1px solid var(--border)' }}>Anterior</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ border: '1px solid var(--border)' }}>Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

