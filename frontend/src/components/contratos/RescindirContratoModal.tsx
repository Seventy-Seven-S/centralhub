'use client';

import { useState } from 'react';
import { X, Upload, AlertTriangle } from 'lucide-react';
import { validarRescision, type RescisionForm } from '@/lib/rescision';
import { todayLocalISO } from '@/lib/utils';

interface Props {
  contratoId: string;
  etiqueta: string; // código legado o número de contrato, para el texto de confirmación
  onClose: () => void;
  onDone: () => void;
}

/**
 * Rescisión / cancelación de un contrato: motivo, fecha, devolución opcional
 * y el documento de cancelación firmado como evidencia (PDF/JPG/PNG).
 * Envía multipart a POST /contracts/:id/rescind.
 */
export function RescindirContratoModal({ contratoId, etiqueta, onClose, onDone }: Props) {
  const [form, setForm] = useState<RescisionForm>({ motivo: '', fecha: todayLocalISO(), devolucion: '' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inputStyle = { border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = validarRescision(form);
    if (msg) { setError(msg); return; }
    if (!window.confirm(`¿Rescindir el contrato ${etiqueta}? Se liberarán sus lotes y se eliminarán las cuotas pendientes. Esta acción no se puede deshacer.`)) return;

    setSaving(true); setError(null);
    try {
      const body = new FormData();
      body.append('reason', form.motivo.trim());
      body.append('date', form.fecha);
      if (form.devolucion.trim() !== '') body.append('refundAmount', form.devolucion.trim());
      if (file) body.append('file', file);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/contracts/${contratoId}/rescind`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'No se pudo rescindir el contrato');
      onDone();
    } catch (err: any) {
      setError(err.message || 'No se pudo rescindir el contrato');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-xl w-full max-w-md" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--danger)' }}>
            <AlertTriangle className="w-5 h-5" /> Rescindir contrato {etiqueta}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-tertiary)' }} aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Motivo</label>
            <textarea
              value={form.motivo}
              onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
              rows={3}
              placeholder="Ej. Cliente firmó carta de cancelación"
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Fecha de rescisión</label>
              <input type="date" value={form.fecha} max={todayLocalISO()}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Devolución al cliente (opcional)</label>
              <input type="number" min={0} step="0.01" inputMode="decimal" value={form.devolucion} placeholder="0"
                onChange={e => setForm(f => ({ ...f, devolucion: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Documento de cancelación firmado (PDF, JPG o PNG)</label>
            <label className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm cursor-pointer" style={inputStyle}>
              <Upload className="w-4 h-4" />
              <span className="truncate">{file ? file.name : 'Seleccionar archivo…'}</span>
              <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>Queda guardado como evidencia en el historial del contrato.</p>
          </div>

          <p className="text-xs rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--danger-pale)', color: 'var(--danger)' }}>
            Al rescindir: el contrato pasa a Rescindido, sus lotes quedan disponibles, las cuotas pendientes se eliminan y los pagos recibidos se conservan como historial.
          </p>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--danger)' }}>
              {saving ? 'Rescindiendo…' : 'Rescindir contrato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
