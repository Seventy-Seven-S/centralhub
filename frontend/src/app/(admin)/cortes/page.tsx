'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pdf } from '@react-pdf/renderer';
import { X, FileDown, Plus, AlertCircle, CheckSquare, Square } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency, formatDateUTC, todayLocalISO } from '@/lib/utils';
import { useProjectSelection } from '@/contexts/ProjectContext';
import { useProyectos } from '@/hooks/useProyectos';
import { useCortes, usePendientesCorte, fetchCorte, type PagoCorte } from '@/hooks/useCortes';
import { resumenReparto, validarCorte, type Egresos } from '@/lib/corte';
import { ComprobanteCorte } from '@/components/pdf/ComprobanteCorte';

interface Categoria { id: string; name: string }
const CAT_DUENO = 'Dueño del terreno';
const DUENO_POR_PROYECTO: Record<string, string> = { JSA1: 'Jesús y Maribel', JSA2: 'Antonio Isassi', JSA3: 'Antonio Isassi', JSA4: 'Antonio Isassi' };

async function abrirComprobante(id: string) {
  const corte = await fetchCorte(id);
  const blob = await pdf(<ComprobanteCorte corte={corte} />).toBlob();
  window.open(URL.createObjectURL(blob), '_blank');
}

// ── Asistente: Generar corte ──────────────────────────────────────────────────
function GenerarCorteModal({ projectId, projectCode, onClose, onDone }: { projectId: string; projectCode: string; onClose: () => void; onDone: (id: string) => void }) {
  const { data: pendientes, isLoading } = usePendientesCorte(projectId);
  const { data: categorias = [] } = useQuery<Categoria[]>({ queryKey: ['expense-categories'], queryFn: async () => (await api.get('/expenses/categories')).data.data });
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({});
  const [egresos, setEgresos] = useState<Egresos>({});
  const [fecha, setFecha] = useState(todayLocalISO());
  const [dueno, setDueno] = useState(DUENO_POR_PROYECTO[projectCode] ?? '');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (pendientes) setSeleccion(Object.fromEntries(pendientes.pagos.map(p => [p.id, true]))); }, [pendientes]);

  const catDueno = categorias.find(c => c.name === CAT_DUENO);
  const catsEgreso = categorias.filter(c => c.name !== CAT_DUENO);
  const pagos = useMemo(() => (pendientes?.pagos ?? []).map(p => ({ id: p.id, amount: p.amount, seleccionado: !!seleccion[p.id] })), [pendientes, seleccion]);
  const r = resumenReparto(pagos, egresos);
  const inputStyle = { border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' };

  async function confirmar() {
    const msg = validarCorte({ pagos, egresos, fecha });
    if (msg) { setError(msg); return; }
    if (!dueno.trim()) { setError('Indica el nombre del dueño que recibe'); return; }
    if (!catDueno) { setError('No existe la categoría "Dueño del terreno" en Gastos'); return; }
    if (!window.confirm(`¿Registrar el corte por ${formatCurrency(r.totalIngresos)} (${r.seleccionados} pagos) y entregar ${formatCurrency(r.entregadoDueno)} a ${dueno}?`)) return;
    setSaving(true); setError(null);
    try {
      const { data } = await api.post('/cortes', {
        projectId, fecha, paymentIds: pagos.filter(p => p.seleccionado).map(p => p.id),
        reparto: Object.entries(egresos).filter(([, v]) => Number(v) > 0).map(([categoryId, v]) => ({ categoryId, amount: Number(v) })),
        dueno: dueno.trim(), duenoCategoryId: catDueno.id, notas: notas.trim() || undefined,
      });
      onDone(data.data.id);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No se pudo registrar el corte');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Generar corte — {projectCode}</h3>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-tertiary)' }}><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-5">
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
              1 · Ingresos pendientes de reportar — desmarca los que no entren en este corte
            </p>
            {isLoading ? <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Cargando…</p> : pagos.length === 0 ? (
              <p className="text-sm rounded-xl px-3 py-3" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>No hay pagos pendientes de corte en este proyecto. Todo lo cobrado ya se reportó.</p>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-sm">
                  <thead><tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <th className="px-3 py-2 w-8"></th>
                    {['Fecha', 'Folio', 'Código', 'Cliente', 'Concepto', 'Monto'].map((h, i) => <th key={h} className={`px-3 py-2 text-xs font-semibold ${i === 5 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text-secondary)' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {(pendientes?.pagos ?? []).map((p: PagoCorte) => (
                      <tr key={p.id} onClick={() => setSeleccion(s => ({ ...s, [p.id]: !s[p.id] }))} className="cursor-pointer hover:bg-[var(--bg-secondary)]" style={{ borderTop: '1px solid var(--border)', opacity: seleccion[p.id] ? 1 : 0.5 }}>
                        <td className="px-3 py-2" style={{ color: 'var(--accent)' }}>{seleccion[p.id] ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDateUTC(p.paymentDate, 'short')}</td>
                        <td className="px-3 py-2 font-mono text-xs">{p.paymentNumber}</td>
                        <td className="px-3 py-2 font-mono text-xs">{p.contract.codigoLegado ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{p.contract.client.firstName} {p.contract.client.lastName}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: 'var(--text-secondary)' }}>{p.concept}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatCurrency(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>2 · Reparto — lo que no se capture aquí se entrega al dueño</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Fecha del corte</label>
                <input type="date" value={fecha} max={todayLocalISO()} onChange={e => setFecha(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Recibe (dueño)</label>
                <input value={dueno} onChange={e => setDueno(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
              {catsEgreso.map(c => (
                <div key={c.id}><label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{c.name}</label>
                  <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0" value={egresos[c.id] ?? ''} onChange={e => setEgresos(x => ({ ...x, [c.id]: e.target.value }))} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
              ))}
              <div className="col-span-2 sm:col-span-3"><label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Notas (opcional)</label>
                <input value={notas} onChange={e => setNotas(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
            </div>
          </div>

          <div className="rounded-xl px-4 py-3 grid grid-cols-3 gap-3 text-sm" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Ingresos ({r.seleccionados} pagos)</p><p className="font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(r.totalIngresos)}</p></div>
            <div><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Egresos capturados</p><p className="font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(r.totalEgresos)}</p></div>
            <div><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Se entrega a {dueno || 'dueño'}</p><p className="font-bold" style={{ color: r.entregadoDueno < 0 ? 'var(--danger)' : 'var(--accent)' }}>{formatCurrency(r.entregadoDueno)}</p></div>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={confirmar} disabled={saving || pagos.length === 0} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--accent)' }}>
            {saving ? 'Registrando…' : 'Confirmar corte'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function CortesPage() {
  const qc = useQueryClient();
  const { selectedProjectId } = useProjectSelection();
  const { data: proyectos = [] } = useProyectos();
  const proyecto = proyectos.find((p: any) => p.id === selectedProjectId);
  const { data: cortes = [], isLoading, isError } = useCortes(selectedProjectId ?? undefined);
  const [abierto, setAbierto] = useState(false);
  const [abriendo, setAbriendo] = useState<string | null>(null);

  async function verComprobante(id: string) {
    setAbriendo(id);
    try { await abrirComprobante(id); } catch (e) { console.error(e); alert('No se pudo generar el comprobante.'); } finally { setAbriendo(null); }
  }

  return (
    <div className="space-y-5">
      {abierto && selectedProjectId && (
        <GenerarCorteModal projectId={selectedProjectId} projectCode={proyecto?.code ?? ''} onClose={() => setAbierto(false)}
          onDone={async (id) => { setAbierto(false); await qc.invalidateQueries({ queryKey: ['cortes'] }); await qc.invalidateQueries({ queryKey: ['ingresos'] }); await qc.invalidateQueries({ queryKey: ['dashboard'] }); verComprobante(id); }} />
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Cortes</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{selectedProjectId ? `${cortes.length} cortes registrados` : 'Selecciona un proyecto para generar un corte'}</p>
        </div>
        <button onClick={() => setAbierto(true)} disabled={!selectedProjectId} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--accent)' }}>
          <Plus className="w-4 h-4" /> Generar corte
        </button>
      </div>

      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
        {isError ? (
          <div className="flex flex-col items-center py-16 gap-2"><AlertCircle className="w-8 h-8 text-red-400" /><p style={{ color: 'var(--text-secondary)' }}>No se pudieron cargar los cortes</p></div>
        ) : isLoading ? (
          <div className="p-5 space-y-2 animate-pulse">{[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}</div>
        ) : cortes.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2"><p style={{ color: 'var(--text-secondary)' }}>Aún no hay cortes registrados</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                {['#', 'Proyecto', 'Fecha', 'Período', 'Pagos', 'Ingresos', 'Egresos', 'Entregado', 'Recibe', ''].map((h, i) => <th key={h + i} className={`px-4 py-3 font-semibold whitespace-nowrap ${[5, 6, 7].includes(i) ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text-secondary)' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {cortes.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 font-semibold">#{c.numero}</td>
                    <td className="px-4 py-3">{c.project?.code}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDateUTC(c.fecha, 'short')}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{c.periodoInicio && c.periodoFin ? `${formatDateUTC(c.periodoInicio, 'short')} — ${formatDateUTC(c.periodoFin, 'short')}` : '—'}</td>
                    <td className="px-4 py-3">{c._count?.payments ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(c.totalIngresos)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(c.totalEgresos)}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--accent)' }}>{formatCurrency(c.entregadoDueno)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{c.dueno}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => verComprobante(c.id)} disabled={abriendo === c.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60" style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                        <FileDown className="w-3.5 h-3.5" /> {abriendo === c.id ? 'Generando…' : 'Comprobante'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
