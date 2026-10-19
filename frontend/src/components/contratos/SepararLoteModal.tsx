'use client';

import { useEffect, useState } from 'react';
import { X, Split, Loader2, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { InputMoneda } from '@/components/ui/InputMoneda';
import { aNumero } from '@/lib/formatoMoneda';
import type { ErrorApi } from '@/lib/errorApi';

interface LoteOpcion { lotId: string; etiqueta: string; precio: number }

interface VistaPrevia {
  contractNumber: string;
  pagadoTotal: number;
  totalPrice: number;
  lotes: LoteOpcion[];
  sugerido: { precioQueSeVa: number; montoQueSeVa: number };
}

interface Props {
  contratoId: string;
  etiqueta: string;
  onClose: () => void;
  onDone: (codigoNuevo: string) => void;
}

/**
 * Separar un lote de un contrato con varios, para que quede en su propio
 * contrato.
 *
 * Lo que la pantalla tiene que dejar claro es el CUADRE: la secretaria escribe
 * cuánto se lleva el lote y ve al instante cuánto le queda al contrato
 * original. Los dos siempre suman lo que había — el dinero se reparte, no se
 * copia, y por eso los ingresos del proyecto no cambian.
 */
export function SepararLoteModal({ contratoId, etiqueta, onClose, onDone }: Props) {
  const [previa, setPrevia] = useState<VistaPrevia | null>(null);
  const [lotId, setLotId] = useState('');
  const [precio, setPrecio] = useState('');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Al elegir lote, el servidor propone el reparto proporcional. Es solo una
  // sugerencia: el acuerdo real con el cliente no siempre es proporcional.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const primero = lotId || undefined;
        const { data } = await api.get(`/contracts/${contratoId}/division`, {
          params: { lotId: primero ?? 'primero' },
        });
        if (!vivo) return;
        const p: VistaPrevia = data.data;
        setPrevia(p);
        if (!lotId && p.lotes.length) setLotId(p.lotes[0].lotId);
      } catch (caught) {
        const e = caught as ErrorApi;
        if (vivo) setError(e?.response?.data?.message ?? 'No se pudo cargar el contrato');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
    // Solo al abrir (o cambiar de contrato): lotId se lee para saber si ya
    // había uno elegido; meterlo como dependencia recargaría la vista previa
    // completa en cada cambio de lote, que ya lo hace el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId]);

  useEffect(() => {
    if (!lotId || !previa) return;
    (async () => {
      const { data } = await api.get(`/contracts/${contratoId}/division`, { params: { lotId } });
      const p: VistaPrevia = data.data;
      setPrevia(p);
      setPrecio(String(p.sugerido.precioQueSeVa));
      setMonto(String(p.sugerido.montoQueSeVa));
    })().catch(() => undefined);
    // Solo al cambiar de lote. 'previa' no va: este efecto la reescribe y se
    // volvería un ciclo; contratoId no cambia mientras el modal está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotId]);

  const precioNum = aNumero(precio);
  const montoNum = aNumero(monto);
  const precioQueQueda = previa ? previa.totalPrice - precioNum : 0;
  const montoQueQueda = previa ? previa.pagadoTotal - montoNum : 0;
  const saldoNuevo = precioNum - montoNum;
  const saldoOriginal = precioQueQueda - montoQueQueda;
  const hayProblema = saldoNuevo < 0 || saldoOriginal < 0 || precioQueQueda <= 0 || montoQueQueda < 0;

  async function guardar() {
    if (!motivo.trim()) { setError('Escribe el motivo de la separación'); return; }
    setGuardando(true); setError(null);
    try {
      const { data } = await api.post(`/contracts/${contratoId}/division`, {
        lotId, precioQueSeVa: precioNum, montoQueSeVa: montoNum, motivo: motivo.trim(),
      });
      onDone(data.data.codigoNuevo);
    } catch (caught) {
      const e = caught as ErrorApi;
      setError(e?.response?.data?.message ?? 'No se pudo separar el lote');
    } finally {
      setGuardando(false);
    }
  }

  const inputStyle = { border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' };
  const campo = 'w-full px-3 py-2.5 text-sm rounded-xl outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
           style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
             style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}>
          <div className="flex items-center gap-2">
            <Split className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Separar un lote</h3>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{etiqueta}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={guardando} className="p-1.5 rounded-lg hover:opacity-70">
            <X className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {cargando && <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Cargando…</p>}

          {previa && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  ¿Cuál lote se separa?
                </label>
                <select value={lotId} onChange={e => setLotId(e.target.value)} disabled={guardando}
                        className={`${campo} cursor-pointer`} style={inputStyle}>
                  {previa.lotes.map(l => (
                    <option key={l.lotId} value={l.lotId}>{l.etiqueta} · {formatCurrency(l.precio)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Precio que se lleva
                  </label>
                  <InputMoneda valor={precio} onValorChange={setPrecio} disabled={guardando}
                               className={campo} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    De lo pagado, se lleva
                  </label>
                  <InputMoneda valor={monto} onValorChange={setMonto} disabled={guardando}
                               className={campo} style={inputStyle} />
                </div>
              </div>

              {/* El cuadre. Es lo importante de esta pantalla: que se vea que
                  los dos lados siempre suman lo que había. */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div className="grid grid-cols-3 px-3 py-2 text-xs font-semibold"
                     style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>
                  <span />
                  <span className="text-right">Lote separado</span>
                  <span className="text-right">Queda en {previa.contractNumber.split('-')[1] ?? 'el original'}</span>
                </div>
                {[
                  ['Precio', precioNum, precioQueQueda],
                  ['Pagado', montoNum, montoQueQueda],
                  ['Saldo', saldoNuevo, saldoOriginal],
                ].map(([etq, a, b], i) => (
                  <div key={etq as string} className="grid grid-cols-3 px-3 py-2 text-sm"
                       style={{ borderTop: '1px solid var(--border)', fontWeight: i === 2 ? 700 : 400 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{etq as string}</span>
                    <span className="text-right" style={{ color: (a as number) < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                      {formatCurrency(a as number)}
                    </span>
                    <span className="text-right" style={{ color: (b as number) < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                      {formatCurrency(b as number)}
                    </span>
                  </div>
                ))}
                <div className="px-3 py-2 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                  Los dos suman {formatCurrency(precioNum + precioQueQueda)} de precio y {formatCurrency(montoNum + montoQueQueda)} pagado, igual que antes
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Motivo</label>
                <textarea value={motivo} onChange={e => setMotivo(e.target.value)} disabled={guardando} rows={2}
                          placeholder="Por qué se separa este lote"
                          className={`${campo} resize-none`} style={inputStyle} />
              </div>

              <div className="rounded-xl p-3 flex gap-2.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  El dinero se reparte entre los dos contratos, no se duplica: los ingresos del proyecto no cambian.
                  Si el lote además cambia de dueño, sepáralo primero y luego usa el traspaso.
                </p>
              </div>
            </>
          )}

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={guardando}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button type="button" onClick={guardar} disabled={guardando || hayProblema || !previa}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ backgroundColor: 'var(--accent)', color: 'white' }}>
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              Separar lote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
