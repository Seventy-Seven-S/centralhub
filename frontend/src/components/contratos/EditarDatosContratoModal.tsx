'use client';

import { useMemo, useState } from 'react';
import { X, Pencil, Loader2, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { useLotes } from '@/hooks/useLotes';
import { formatCurrency } from '@/lib/utils';
import { InputMoneda } from '@/components/ui/InputMoneda';
import {
  cambiosDelFormulario, validarFormulario, mesDeFecha,
  DatosContrato, FormEdicion,
} from '@/lib/edicionContratoForm';

interface Props {
  contratoId: string;
  etiqueta: string;
  projectId: string;
  actual: DatosContrato;
  pagado: number;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Corrección de los datos de dinero del contrato. Solo ADMIN.
 *
 * Guardar aquí NO es cambiar un número suelto: el backend rehace el calendario
 * de cuotas con los valores nuevos, vuelve a aplicar encima todos los pagos
 * reales y recalcula balance y mora. Por eso el motivo es obligatorio y por eso
 * la pantalla lo advierte antes de guardar.
 */
export function EditarDatosContratoModal({
  contratoId, etiqueta, projectId, actual, pagado, onClose, onDone,
}: Props) {
  const { data: lotes = [] } = useLotes(projectId);

  const [form, setForm] = useState<FormEdicion>({
    totalPrice: String(actual.totalPrice ?? ''),
    installmentAmount: String(actual.installmentAmount ?? ''),
    installmentCount: String(actual.installmentCount ?? ''),
    mesInicioCalendario: mesDeFecha(actual.startDate),
    lotIds: actual.lotIds,
  });
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cambios = useMemo(() => cambiosDelFormulario(actual, form), [actual, form]);
  const hayCambios = Object.keys(cambios).length > 0;

  const set = (k: keyof FormEdicion) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = validarFormulario(actual, form, motivo);
    if (msg) { setError(msg); return; }

    setSaving(true); setError(null);
    try {
      await api.patch(`/contracts/${contratoId}/datos`, { ...cambios, motivo: motivo.trim() });
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No se pudo guardar el cambio');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  };
  const campo = 'w-full px-3 py-2.5 text-sm rounded-xl outline-none';
  const etiquetaCampo = 'block text-xs font-medium mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
           style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
             style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}>
          <div className="flex items-center gap-2">
            <Pencil className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Corregir datos del contrato</h3>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{etiqueta}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving}
                  className="p-1.5 rounded-lg transition hover:opacity-70">
            <X className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={etiquetaCampo} style={{ color: 'var(--text-secondary)' }}>Precio total</label>
              <InputMoneda valor={form.totalPrice} onValorChange={v => setForm(f => ({ ...f, totalPrice: v }))}
                           disabled={saving} className={campo} style={inputStyle} />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Lleva pagado {formatCurrency(pagado)}
              </p>
            </div>
            <div>
              <label className={etiquetaCampo} style={{ color: 'var(--text-secondary)' }}>Mensualidad</label>
              <InputMoneda valor={form.installmentAmount} onValorChange={v => setForm(f => ({ ...f, installmentAmount: v }))}
                           disabled={saving} className={campo} style={inputStyle} />
            </div>
            <div>
              <label className={etiquetaCampo} style={{ color: 'var(--text-secondary)' }}>Plazo (meses)</label>
              <input value={form.installmentCount} onChange={set('installmentCount')} disabled={saving}
                     inputMode="numeric" className={campo} style={inputStyle} />
            </div>
            <div>
              <label className={etiquetaCampo} style={{ color: 'var(--text-secondary)' }}>Primera mensualidad</label>
              <input type="month" value={form.mesInicioCalendario} onChange={set('mesInicioCalendario')}
                     disabled={saving} className={campo} style={inputStyle} />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                El mes al que se aplica la cuota 1
              </p>
            </div>
          </div>

          <div>
            <label className={etiquetaCampo} style={{ color: 'var(--text-secondary)' }}>Manzana y lote</label>
            <select value={form.lotIds[0] ?? ''} disabled={saving}
                    onChange={e => setForm(f => ({ ...f, lotIds: e.target.value ? [e.target.value] : [] }))}
                    className={`${campo} cursor-pointer`} style={inputStyle}>
              {lotes.map(l => (
                <option key={l.id} value={l.id}>
                  Manzana {l.manzana} Lote {l.lotNumber}
                  {l.status !== 'AVAILABLE' && !form.lotIds.includes(l.id) ? ' — ocupado' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Solo para corregir una captura equivocada. Si el cliente se cambió de lote, usa el traspaso.
            </p>
          </div>

          <div>
            <label className={etiquetaCampo} style={{ color: 'var(--text-secondary)' }}>Motivo del cambio</label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} disabled={saving} rows={2}
                      placeholder="Qué se está corrigiendo y por qué"
                      className={`${campo} resize-none`} style={inputStyle} />
          </div>

          {hayCambios && (
            <div className="rounded-xl p-3 flex gap-2.5"
                 style={{ backgroundColor: 'var(--warning-pale, var(--bg-secondary))', border: '1px solid var(--border)' }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Al guardar se rehace el calendario de cuotas y se vuelven a aplicar todos los pagos del cliente.
                El saldo y los meses de mora se recalculan, y pueden cambiar. Queda registrado con tu nombre.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl transition"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || !hayCambios}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ backgroundColor: 'var(--accent)', color: 'white' }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar corrección
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
