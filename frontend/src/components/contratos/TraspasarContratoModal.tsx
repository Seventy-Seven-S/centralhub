'use client';

import { useMemo, useState } from 'react';
import { X, Upload, ArrowRightLeft, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatCurrency, normalizeForSearch, todayLocalISO } from '@/lib/utils';
import { useLotes } from '@/hooks/useLotes';
import { validarFormularioTraspaso, resumenDinero } from './traspasoForm';

interface Props {
  contratoId: string;
  etiqueta: string;          // código legado o número de contrato
  clienteActual: string;
  projectIdActual: string;
  lotIdsActuales: string[];
  abonado: number;           // suma de sus pagos confirmados
  onClose: () => void;
  onDone: () => void;
}

interface ClienteBusqueda { id: string; firstName: string; lastName: string }
interface Proyecto { id: string; code: string; name: string }

/**
 * Traspaso de un contrato: a quién pasa el lote y cuánto de lo abonado se le
 * respeta al cliente que se va.
 *
 * La secretaria NO elige el "tipo" de traspaso: los selectores vienen
 * precargados con el lote y proyecto actuales, así que dejarlos como están es
 * un cambio de titular y moverlos es una reubicación. El backend lo deduce.
 */
export function TraspasarContratoModal({
  contratoId, etiqueta, clienteActual, projectIdActual, lotIdsActuales, abonado, onClose, onDone,
}: Props) {
  const [clienteNuevoId, setClienteNuevoId] = useState('');
  const [buscaCliente, setBuscaCliente] = useState('');
  const [projectIdDestino, setProjectIdDestino] = useState(projectIdActual);
  const [lotIdsDestino, setLotIdsDestino] = useState<string[]>(lotIdsActuales);
  const [montoRespetado, setMontoRespetado] = useState(String(abonado));
  const [nota, setNota] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fecha, setFecha] = useState(todayLocalISO());
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Datos del contrato destino: solo se piden cuando de verdad hace falta.
  const [precio, setPrecio] = useState('');
  const [enganche, setEnganche] = useState('0');
  const [mensualidad, setMensualidad] = useState('');
  const [plazo, setPlazo] = useState('60');

  const { data: proyectos = [] } = useQuery<Proyecto[]>({
    queryKey: ['proyectos-traspaso'],
    queryFn: async () => (await api.get('/projects')).data.data,
    staleTime: 300_000,
  });
  const { data: lotes = [] } = useLotes(projectIdDestino);
  const { data: clientes = [] } = useQuery<ClienteBusqueda[]>({
    queryKey: ['clientes-traspaso'],
    queryFn: async () => (await api.get('/clients')).data.data.clients ?? (await api.get('/clients')).data.data,
    staleTime: 300_000,
  });

  const mismoLote = useMemo(
    () => projectIdDestino === projectIdActual
      && [...lotIdsDestino].sort().join('|') === [...lotIdsActuales].sort().join('|'),
    [projectIdDestino, projectIdActual, lotIdsDestino, lotIdsActuales],
  );

  const lotesElegibles = useMemo(
    () => lotes.filter(l => l.status === 'AVAILABLE' || lotIdsActuales.includes(l.id)),
    [lotes, lotIdsActuales],
  );

  const clientesFiltrados = useMemo(() => {
    const q = normalizeForSearch(buscaCliente.trim());
    if (!q) return [];
    return clientes
      .filter(c => normalizeForSearch(`${c.firstName} ${c.lastName}`).includes(q))
      .slice(0, 6);
  }, [clientes, buscaCliente]);

  const dinero = resumenDinero(abonado, montoRespetado);
  const inputStyle = { border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = validarFormularioTraspaso({
      clienteNuevoId, lotIdsDestino, projectIdDestino, montoRespetado, abonado, nota,
    });
    if (msg) { setError(msg); return; }
    if (!mismoLote && (!precio.trim() || !mensualidad.trim())) {
      setError('Captura el precio y la mensualidad del contrato nuevo');
      return;
    }

    setSaving(true); setError(null);
    try {
      const body = new FormData();
      body.append('contratoOrigenId', contratoId);
      body.append('clienteNuevoId', clienteNuevoId);
      body.append('projectIdDestino', projectIdDestino);
      for (const id of lotIdsDestino) body.append('lotIdsDestino', id);
      body.append('montoRespetado', String(dinero.respetado));
      body.append('fecha', fecha);
      if (motivo.trim()) body.append('motivo', motivo.trim());
      if (nota.trim()) body.append('nota', nota.trim());
      if (file) body.append('file', file);
      if (!mismoLote) {
        body.append('datosContratoDestino[totalPrice]', precio.replace(/[$,\s]/g, ''));
        body.append('datosContratoDestino[downPayment]', enganche.replace(/[$,\s]/g, '') || '0');
        body.append('datosContratoDestino[installmentAmount]', mensualidad.replace(/[$,\s]/g, ''));
        body.append('datosContratoDestino[installmentCount]', plazo);
        body.append('datosContratoDestino[startDate]', fecha);
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/traspasos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'No se pudo registrar el traspaso');
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
             style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Traspasar {etiqueta}</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Actualmente de {clienteActual}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Quién recibe */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              ¿Quién recibe el lote?
            </label>
            {clienteNuevoId ? (
              <div className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm"
                   style={{ backgroundColor: 'var(--accent-pale)', color: 'var(--text-primary)' }}>
                <span>{clientes.find(c => c.id === clienteNuevoId)?.firstName} {clientes.find(c => c.id === clienteNuevoId)?.lastName}</span>
                <button type="button" onClick={() => { setClienteNuevoId(''); setBuscaCliente(''); }}
                        className="text-xs underline" style={{ color: 'var(--accent)' }}>cambiar</button>
              </div>
            ) : (
              <>
                <input value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
                       placeholder="Busca por nombre…"
                       className="w-full px-3 py-2.5 text-sm rounded-xl outline-none" style={inputStyle} />
                {clientesFiltrados.length > 0 && (
                  <div className="mt-1 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    {clientesFiltrados.map(c => (
                      <button key={c.id} type="button"
                              onClick={() => { setClienteNuevoId(c.id); setBuscaCliente(''); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-secondary)]"
                              style={{ color: 'var(--text-primary)' }}>
                        {c.firstName} {c.lastName}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* A dónde va */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Proyecto</label>
              <select value={projectIdDestino} disabled={saving}
                      onChange={e => { setProjectIdDestino(e.target.value); setLotIdsDestino([]); }}
                      className="w-full px-3 py-2.5 text-sm rounded-xl outline-none cursor-pointer" style={inputStyle}>
                {proyectos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Lote</label>
              <select value={lotIdsDestino[0] ?? ''} disabled={saving}
                      onChange={e => setLotIdsDestino(e.target.value ? [e.target.value] : [])}
                      className="w-full px-3 py-2.5 text-sm rounded-xl outline-none cursor-pointer" style={inputStyle}>
                <option value="">— Elegir —</option>
                {lotesElegibles.map(l => (
                  <option key={l.id} value={l.id}>M{l.manzana} L-{l.lotNumber}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>
            {mismoLote
              ? 'Mismo lote: el contrato sigue siendo el mismo y solo cambia de dueño. Conserva todos sus pagos.'
              : 'Otro lote o proyecto: se cierra este contrato y se abre uno nuevo para el cliente que recibe.'}
          </p>

          {/* Datos del contrato nuevo, solo si hace falta */}
          {!mismoLote && (
            <div className="grid grid-cols-2 gap-3 rounded-xl p-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <div className="col-span-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Contrato nuevo</p>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Precio</label>
                <input inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value)}
                       className="w-full px-3 py-2 text-sm rounded-lg outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Enganche</label>
                <input inputMode="decimal" value={enganche} onChange={e => setEnganche(e.target.value)}
                       className="w-full px-3 py-2 text-sm rounded-lg outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Mensualidad</label>
                <input inputMode="decimal" value={mensualidad} onChange={e => setMensualidad(e.target.value)}
                       className="w-full px-3 py-2 text-sm rounded-lg outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Plazo (meses)</label>
                <input inputMode="numeric" value={plazo} onChange={e => setPlazo(e.target.value)}
                       className="w-full px-3 py-2 text-sm rounded-lg outline-none" style={inputStyle} />
              </div>
            </div>
          )}

          {/* El dinero */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              ¿Cuánto se le respeta de lo que abonó?
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
              {clienteActual} lleva abonados <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(abonado)}</strong>.
            </p>
            <input inputMode="decimal" value={montoRespetado} disabled={saving}
                   onChange={e => setMontoRespetado(e.target.value)}
                   className="w-full px-3 py-2.5 text-sm rounded-xl outline-none tabular-nums" style={inputStyle} />
          </div>

          {dinero.hayDiferencia && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: 'var(--gold-pale)', color: 'var(--gold)' }}>
              No se le respetan <strong>{formatCurrency(dinero.sePierde)}</strong> de lo que abonó. La nota es obligatoria.
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Nota {dinero.hayDiferencia && <span style={{ color: 'var(--danger)' }}>*</span>}
            </label>
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} disabled={saving}
                      placeholder={dinero.hayDiferencia ? 'Qué se acordó con el cliente' : 'Opcional'}
                      className="w-full px-3 py-2 text-sm rounded-xl outline-none resize-none" style={inputStyle} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} disabled={saving}
                     className="w-full px-3 py-2.5 text-sm rounded-xl outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Motivo</label>
              <input value={motivo} onChange={e => setMotivo(e.target.value)} disabled={saving}
                     placeholder="Opcional"
                     className="w-full px-3 py-2.5 text-sm rounded-xl outline-none" style={inputStyle} />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <Upload className="w-4 h-4" />
              {file ? file.name : 'Adjuntar documento firmado (opcional)'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                     onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-pale)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ backgroundColor: 'var(--accent)' }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Registrar traspaso
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
