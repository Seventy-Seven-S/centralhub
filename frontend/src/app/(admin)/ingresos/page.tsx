'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency, formatDateUTC, normalizeForSearch } from '@/lib/utils';
import { useProjectSelection } from '@/contexts/ProjectContext';

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

const TIPO: Record<string, string> = { DOWN_PAYMENT: 'Enganche', INSTALLMENT: 'Mensualidad', EXTRA_PAYMENT: 'Abono', ADJUSTMENT: 'Ajuste', RESCISSION_REFUND: 'Devolución', RESERVATION_DEPOSIT: 'Apartado' };
const METODO: Record<string, string> = { TRANSFER: 'Transferencia', CASH: 'Efectivo', CARD: 'Tarjeta', CHECK: 'Cheque', DEPOSIT: 'Depósito' };
const PAGE_SIZE = 50;

export default function IngresosPage() {
  const router = useRouter();
  const { selectedProjectId } = useProjectSelection();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const { data: ingresos = [], isLoading, isError } = useQuery<Ingreso[]>({
    queryKey: ['ingresos', selectedProjectId ?? 'all', desde, hasta],
    queryFn: async () => (await api.get('/payments', { params: { projectId: selectedProjectId ?? undefined, startDate: desde || undefined, endDate: hasta ? `${hasta}T23:59:59` : undefined, status: 'CONFIRMED' } })).data.data,
  });

  const filtrados = useMemo(() => {
    const n = normalizeForSearch(q.trim());
    const list = n
      ? ingresos.filter(i => normalizeForSearch(`${i.contract.client.firstName} ${i.contract.client.lastName}`).includes(n) || normalizeForSearch(i.contract.codigoLegado ?? '').includes(n) || normalizeForSearch(i.paymentNumber).includes(n))
      : ingresos;
    return [...list].sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
  }, [ingresos, q]);

  const total = useMemo(() => filtrados.reduce((a, i) => a + i.amount, 0), [filtrados]);
  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pagina = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const inputStyle = { border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Ingresos</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {isLoading ? 'Cargando…' : `${filtrados.length} pagos · ${formatCurrency(total)}`}{!selectedProjectId && ' · todos los proyectos'}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Buscar por cliente, código o folio…" className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none" style={inputStyle} />
        <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1); }} className="rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} title="Desde" />
        <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1); }} className="rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} title="Hasta" />
      </div>

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
                    {['Fecha', 'Folio', 'Código', 'Cliente', 'Lote', 'Concepto', 'Tipo', 'Método', 'Corte', 'Monto'].map((h, i) => (
                      <th key={h} className={`px-4 py-3 font-semibold whitespace-nowrap ${i === 9 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text-secondary)' }}>{h}</th>
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
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{TIPO[i.paymentType] ?? i.paymentType}</td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{METODO[i.paymentMethod] ?? i.paymentMethod}</td>
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
